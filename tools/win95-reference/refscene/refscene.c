/*
 * refscene: shows whole Windows 95 windows and live controls (the "scenes", sheets 4 and up of ../refgrid/cells.def)
 * and reports their measurements and state over the serial port, so a script outside the guest can press keys and
 * move the mouse through the emulator and read back what the real system did.
 *
 * Target: Windows 95 (4.00), like refgrid. Nothing here needs a later system: no GetGUIThreadInfo, no EndMenu,
 * no structure passed at a size later Windows gave it.
 *
 * Control channel: COM1 at 115200 baud, 8 data bits, no parity. One command a line; every answer ends with a line
 * holding a single full stop. Commands (the letter, then arguments separated by spaces):
 *   P            ping: answers "pong"
 *   I            the system: versions, display, the input timings Windows reports
 *   S n          show scene n (a sheet number of cells.def). Poll Q until it says ready=1.
 *   Q            state: scene, active window, focus owner, default button, pointer, open menus and their highlighted
 *                items, the state of every control in the scene's windows, and the events logged since the last Q
 *   D            dump: the rectangle of every window, client area and child control, the parts inside controls
 *                (tab items, toolbar buttons, tree and list items, menu items), and the dialog-unit rectangle of
 *                every control that came from one of our templates
 *   F id         give the keyboard focus to the control of the cell with that id
 *   M x y        put the pointer at x, y with SetCursorPos (a fallback; scripts normally move the emulated mouse)
 *   V 0|1        hide or show the pointer
 *   X            leave the program            Z   shut Windows down
 *
 * Events carry the guest's own clock in milliseconds (timeGetTime), so delays such as the time a cascading menu
 * takes to open, or a scroll bar's repeat rate, are measured inside the guest and not by the script's waits.
 *
 * REFGRID.INI beside the program may ask for a display mode, exactly as for refgrid:  [refgrid] bits= width= height=
 */
#define WINVER 0x0400
#define _WIN32_WINNT 0x0400
#define _WIN32_WINDOWS 0x0400
#define _WIN32_IE 0x0200
#include <stdarg.h>
#include <windows.h>
#include <commctrl.h>
#include <commdlg.h>
#include <prsht.h>
#include <mmsystem.h>
#include "../refgrid/cells.h"

#define SCREEN_W 640
#define SCREEN_H 480
#define FIRST_SCENE 4

static const CELL cells[] = {
#define DLG(name, w, h, style, caption)
#define CTL(dlg, id, cls, x, y, w, h, style, text)
#define CELL(sheet, id, kind, x, y, w, h, a, b, state, text) { sheet, #id, kind, x, y, w, h, (DWORD)(a), (DWORD)(b), state, text },
#include "../refgrid/cells.def"
#undef CELL
#undef DLG
#undef CTL
};
#define NCELLS (sizeof(cells) / sizeof(cells[0]))

static const DLGDEF dlgs[] = {
#define CELL(sheet, id, kind, x, y, w, h, a, b, state, text)
#define CTL(dlg, id, cls, x, y, w, h, style, text)
#define DLG(name, w, h, style, caption) { #name, w, h, (DWORD)(style), caption },
#include "../refgrid/cells.def"
#undef CELL
#undef DLG
#undef CTL
};
#define NDLGS (sizeof(dlgs) / sizeof(dlgs[0]))

static const CTLDEF ctls[] = {
#define CELL(sheet, id, kind, x, y, w, h, a, b, state, text)
#define DLG(name, w, h, style, caption)
#define CTL(dlg, id, cls, x, y, w, h, style, text) { #dlg, id, cls, x, y, w, h, (DWORD)(style), text },
#include "../refgrid/cells.def"
#undef CELL
#undef DLG
#undef CTL
};
#define NCTLS (sizeof(ctls) / sizeof(ctls[0]))

#define WM_APP_SCENE (WM_APP + 1)
#define TIMER_POLL  1
#define TIMER_RETRY 2

/* Menu command ids of the frame window. */
enum { IDM_NEW = 1001, IDM_OPEN, IDM_SAVE, IDM_EXIT, IDM_MRU1 = 1011, IDM_MRU2, IDM_UNDO = 1021, IDM_CUT, IDM_COPY, IDM_PASTE, IDM_FIND,
       IDM_GRID = 1031, IDM_ZOOM100, IDM_ZOOM200, IDM_FITPAGE, IDM_WHOLEPAGE, IDM_STATUSBAR, IDM_TOOLBAR, IDM_TOOLTIPS, IDM_ABOUT = 1041,
       IDM_CTX_OPEN = 2001, IDM_CTX_RENAME, IDM_CTX_DELETE, IDM_TILE = 2101, IDM_CASCADE, IDM_FIRSTCHILD = 2200 };

static HINSTANCE hInst;
static HWND hCtl, hHost, hFrame, hMdiClient, hDialog;
static HWND cellWnd[NCELLS], cellAux[NCELLS];
static HANDLE hCom = INVALID_HANDLE_VALUE;
static HFONT hFont;
static HACCEL hAccel;
static HIMAGELIST hSmall, hLarge;
static HMENU hBar, hFile, hEdit, hView, hZoom, hCustom, hHelp, hContext, hWindowMenu;
static int scene = 0, built = 0, modalDepth = 0, pendingScene = -1, inMenu = 0, cursorShown = 1, initing = 0;
static DWORD builtAt;
static HMENU chain[8]; static int chainN;
static char dir[MAX_PATH], iniPath[MAX_PATH];
static char modeNote[160] = "not requested";
static UINT findMsg;
static FINDREPLACEA fr; static char findWhat[80];
static int sortColumn = 0, sortAscending = 1;
static int pageReady[5];
static HWND templateWnd[16];   /* the window made from each template of cells.def, by its index in dlgs[] */
static DWORD lastMove;   /* guest clock at the last mouse move this thread took from its queue */
static char appliedTitle[80] = "Untitled", appliedOrientation[40] = "Portrait";

/* ---- output ---------------------------------------------------------------------------------------------- */

static char outBuf[60000]; static int outLen;
static char evBuf[16000]; static int evLen;

static void put(const char *fmt, ...)
{
    char line[1100]; int n; va_list ap;
    va_start(ap, fmt); n = wvsprintfA(line, fmt, ap); va_end(ap);
    if (outLen + n >= (int)sizeof(outBuf) - 8) return;
    CopyMemory(outBuf + outLen, line, n); outLen += n;
}

/* Log an event with the guest's clock. Events are sent, and forgotten, with the next Q. */
static void ev(const char *fmt, ...)
{
    char line[1100]; int n; va_list ap;
    n = wsprintfA(line, "e t=%lu ", (unsigned long)timeGetTime());
    va_start(ap, fmt); n += wvsprintfA(line + n, fmt, ap); va_end(ap);
    line[n++] = '\r'; line[n++] = '\n';
    if (evLen + n >= (int)sizeof(evBuf)) return;
    CopyMemory(evBuf + evLen, line, n); evLen += n;
}

static void flushOut(void)
{
    DWORD done;
    put(".\r\n");
    if (hCom != INVALID_HANDLE_VALUE) WriteFile(hCom, outBuf, outLen, &done, NULL);
    outLen = 0;
}

/* Text safe for one line of the protocol: no quotes, no control characters, at most `max` characters. */
static const char *clean(const char *s, int max)
{
    static char buf[4][260]; static int turn; char *d = buf[turn = (turn + 1) & 3]; int i;
    if (max > 255) max = 255;
    for (i = 0; s[i] && i < max; i++) d[i] = s[i] == '"' ? '\'' : (unsigned char)s[i] < 32 ? ' ' : s[i];
    d[i] = 0;
    return d;
}

static void openCom(void)
{
    DCB dcb; COMMTIMEOUTS to;
    hCom = CreateFileA("COM1", GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
    if (hCom == INVALID_HANDLE_VALUE) return;
    SetupComm(hCom, 4096, 65536);
    ZeroMemory(&dcb, sizeof(dcb)); dcb.DCBlength = sizeof(dcb); GetCommState(hCom, &dcb);
    dcb.BaudRate = CBR_115200; dcb.ByteSize = 8; dcb.Parity = NOPARITY; dcb.StopBits = ONESTOPBIT; dcb.fBinary = TRUE; dcb.fParity = FALSE;
    dcb.fOutxCtsFlow = FALSE; dcb.fOutxDsrFlow = FALSE; dcb.fDsrSensitivity = FALSE; dcb.fOutX = FALSE; dcb.fInX = FALSE;
    dcb.fDtrControl = DTR_CONTROL_ENABLE; dcb.fRtsControl = RTS_CONTROL_ENABLE; dcb.fNull = FALSE; dcb.fAbortOnError = FALSE;
    SetCommState(hCom, &dcb);
    to.ReadIntervalTimeout = MAXDWORD; to.ReadTotalTimeoutMultiplier = 0; to.ReadTotalTimeoutConstant = 0;   /* a read returns at once with what is there */
    to.WriteTotalTimeoutMultiplier = 0; to.WriteTotalTimeoutConstant = 20000;
    SetCommTimeouts(hCom, &to);
}

/* ---- display mode (the same arrangement as refgrid) --------------------------------------------------------- */

static BOOL applyDisplayMode(void)
{
    int bits = GetPrivateProfileIntA("refgrid", "bits", 0, iniPath), width = GetPrivateProfileIntA("refgrid", "width", 0, iniPath), height = GetPrivateProfileIntA("refgrid", "height", 0, iniPath);
    int attempted = GetPrivateProfileIntA("state", "attempted", 0, iniPath);
    HDC dc = GetDC(NULL); int nowBits = GetDeviceCaps(dc, BITSPIXEL) * GetDeviceCaps(dc, PLANES), nowW = GetSystemMetrics(SM_CXSCREEN), nowH = GetSystemMetrics(SM_CYSCREEN);
    DEVMODEA dm; LONG result; int i; BOOL found = FALSE;
    ReleaseDC(NULL, dc);
    if (!bits) return FALSE;
    if (!width) width = nowW;
    if (!height) height = nowH;
    if (bits == nowBits && width == nowW && height == nowH) { wsprintfA(modeNote, "requested %d x %d, %d bits: in effect", width, height, bits); WritePrivateProfileStringA("state", "attempted", "0", iniPath); return FALSE; }
    if (attempted) { wsprintfA(modeNote, "requested %d x %d, %d bits; still %d x %d, %d bits after a restart", width, height, bits, nowW, nowH, nowBits); return FALSE; }
    for (i = 0; ; i++) {
        ZeroMemory(&dm, sizeof(dm)); dm.dmSize = sizeof(dm);
        if (!EnumDisplaySettingsA(NULL, i, &dm)) break;
        if ((int)dm.dmBitsPerPel == bits && (int)dm.dmPelsWidth == width && (int)dm.dmPelsHeight == height) { found = TRUE; break; }
    }
    if (!found) { wsprintfA(modeNote, "requested %d x %d, %d bits: the display driver does not list that mode", width, height, bits); return FALSE; }
    dm.dmFields = DM_BITSPERPEL | DM_PELSWIDTH | DM_PELSHEIGHT;
    result = ChangeDisplaySettingsA(&dm, CDS_UPDATEREGISTRY);
    if (result == DISP_CHANGE_SUCCESSFUL) { wsprintfA(modeNote, "requested %d x %d, %d bits: changed without a restart", width, height, bits); return FALSE; }
    if (result == DISP_CHANGE_RESTART) { WritePrivateProfileStringA("state", "attempted", "1", iniPath); WritePrivateProfileStringA(NULL, NULL, NULL, iniPath); ExitWindowsEx(EWX_REBOOT, 0); return TRUE; }
    wsprintfA(modeNote, "requested %d x %d, %d bits: ChangeDisplaySettings failed (%d)", width, height, bits, (int)result);
    return FALSE;
}

/* ---- the I command ----------------------------------------------------------------------------------------- */

static void putVersionOfFile(const char *name, char *path)
{
    DWORD zero, size; static BYTE block[4096]; VS_FIXEDFILEINFO *info; UINT length;
    size = GetFileVersionInfoSizeA(path, &zero);
    if (!size || size > sizeof(block) || !GetFileVersionInfoA(path, 0, size, block) || !VerQueryValueA(block, "\\", (void **)&info, &length)) { put("%s=no version resource\r\n", name); return; }
    put("%s=%d.%d.%d.%d\r\n", name, HIWORD(info->dwFileVersionMS), LOWORD(info->dwFileVersionMS), HIWORD(info->dwFileVersionLS), LOWORD(info->dwFileVersionLS));
}
static void putSystemFileVersion(const char *file)
{
    char path[MAX_PATH + 16]; UINT n = GetSystemDirectoryA(path, MAX_PATH);
    if (!n || n >= MAX_PATH) return;
    wsprintfA(path + n, "\\%s", file);
    putVersionOfFile(file, path);
}

static void info(void)
{
    OSVERSIONINFOA v; HDC dc = GetDC(NULL); int mouse[3] = { 0, 0, 0 }, value = 0; DWORD delay = 0; LONG base = GetDialogBaseUnits();
    static const char *const files[] = { "comctl32.dll", "comdlg32.dll", "user32.dll", "gdi32.dll", "kernel32.dll", "user.exe", "gdi.exe", "shell32.dll" }; int i;
    HMODULE ntdll = GetModuleHandleA("ntdll.dll"); FARPROC wine = ntdll ? GetProcAddress(ntdll, "wine_get_version") : NULL;
    put("[system]\r\n");
    v.dwOSVersionInfoSize = sizeof(v);
    if (GetVersionExA(&v)) put("version=%d.%d build %d platform %d csd \"%s\"\r\n", (int)v.dwMajorVersion, (int)v.dwMinorVersion, (int)LOWORD(v.dwBuildNumber), (int)v.dwPlatformId, v.szCSDVersion);
    if (wine) put("wine=%s\r\n", ((const char *(*)(void))wine)()); else put("wine=no\r\n");
    for (i = 0; i < sizeof(files) / sizeof(files[0]); i++) putSystemFileVersion(files[i]);
    put("screen=%d x %d\r\nbitspixel=%d\r\nplanes=%d\r\n", GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN), GetDeviceCaps(dc, BITSPIXEL), GetDeviceCaps(dc, PLANES));
    put("displaymode=%s\r\n", modeNote);
    put("dialogbaseunits=%d x %d\r\n", LOWORD(base), HIWORD(base));
    put("[input]\r\n");
    put("GetDoubleClickTime=%u\r\nGetCaretBlinkTime=%u\r\n", GetDoubleClickTime(), GetCaretBlinkTime());
    if (SystemParametersInfoA(SPI_GETKEYBOARDDELAY, 0, &value, 0)) put("SPI_GETKEYBOARDDELAY=%d\r\n", value);
    if (SystemParametersInfoA(SPI_GETKEYBOARDSPEED, 0, &delay, 0)) put("SPI_GETKEYBOARDSPEED=%lu\r\n", delay);
    if (SystemParametersInfoA(SPI_GETMOUSE, 0, mouse, 0)) put("SPI_GETMOUSE=%d,%d,%d\r\n", mouse[0], mouse[1], mouse[2]);
    delay = 0xdeadbeef;
    if (SystemParametersInfoA(106 /* SPI_GETMENUSHOWDELAY, added after Windows 95 */, 0, &delay, 0)) put("SPI_GETMENUSHOWDELAY=%lu\r\n", delay); else put("SPI_GETMENUSHOWDELAY=not supported (error %lu)\r\n", GetLastError());
    put("SM_CXDOUBLECLK=%d\r\nSM_CYDOUBLECLK=%d\r\nSM_CXDRAG=%d\r\nSM_CYDRAG=%d\r\nSM_MOUSEPRESENT=%d\r\nSM_CMOUSEBUTTONS=%d\r\nSM_SWAPBUTTON=%d\r\n",
        GetSystemMetrics(SM_CXDOUBLECLK), GetSystemMetrics(SM_CYDOUBLECLK), GetSystemMetrics(SM_CXDRAG), GetSystemMetrics(SM_CYDRAG), GetSystemMetrics(SM_MOUSEPRESENT), GetSystemMetrics(SM_CMOUSEBUTTONS), GetSystemMetrics(SM_SWAPBUTTON));
    put("[sizes]\r\nPROPSHEETHEADER=%d\r\nPROPSHEETPAGE=%d\r\nOPENFILENAME=%d\r\ncom1=%s\r\n", (int)sizeof(PROPSHEETHEADERA), (int)sizeof(PROPSHEETPAGEA), (int)sizeof(OPENFILENAMEA), hCom == INVALID_HANDLE_VALUE ? "closed" : "open");
    ReleaseDC(NULL, dc);
}

/* ---- describing windows -------------------------------------------------------------------------------------- */

static int cellOf(HWND h) { int i; for (i = 0; i < NCELLS; i++) if (h && (cellWnd[i] == h || cellAux[i] == h)) return i; return -1; }
static BOOL isClass(HWND h, const char *name) { char cls[64]; GetClassNameA(h, cls, sizeof(cls)); return !lstrcmpiA(cls, name); }

static const char *menuName(HMENU m)
{
    static char other[24];
    if (!m) return "none";
    if (m == hBar) return "bar"; if (m == hFile) return "file"; if (m == hEdit) return "edit"; if (m == hView) return "view";
    if (m == hZoom) return "zoom"; if (m == hCustom) return "custom"; if (m == hHelp) return "help"; if (m == hContext) return "context"; if (m == hWindowMenu) return "window";
    if (hFrame && m == GetSystemMenu(hFrame, FALSE)) return "system";
    wsprintfA(other, "menu%08lx", (unsigned long)m);
    return other;
}

static void putWindowLine(const char *tag, HWND h)
{
    char cls[64], text[200]; RECT rc; int cell = cellOf(h);
    if (!h) { put("%s none\r\n", tag); return; }
    GetClassNameA(h, cls, sizeof(cls)); text[0] = 0; SendMessageA(h, WM_GETTEXT, sizeof(text), (LPARAM)text);
    GetWindowRect(h, &rc);
    put("%s hwnd=%08lx id=%d class=\"%s\" text=\"%s\" cell=%s rect=%d,%d,%d,%d\r\n", tag, (unsigned long)h, (GetWindowLongA(h, GWL_STYLE) & WS_CHILD) ? GetDlgCtrlID(h) : 0, cls, clean(text, 120),
        cell >= 0 ? cells[cell].id : "-", (int)rc.left, (int)rc.top, (int)(rc.right - rc.left), (int)(rc.bottom - rc.top));
}

/* The readable state of one control, as "key=value" words appended to the line being written. */
static void putControlState(HWND h)
{
    char cls[64], text[200]; int i, n; DWORD style = GetWindowLongA(h, GWL_STYLE);
    GetClassNameA(h, cls, sizeof(cls));
    if (!lstrcmpiA(cls, "Button")) {
        int type = style & 0x0f; LRESULT st = SendMessageA(h, BM_GETSTATE, 0, 0);
        put(" type=%s check=%d pushed=%d bmfocus=%d", type == BS_PUSHBUTTON ? "push" : type == BS_DEFPUSHBUTTON ? "defpush" : type == BS_GROUPBOX ? "group" : (type == BS_RADIOBUTTON || type == BS_AUTORADIOBUTTON) ? "radio" :
            (type == BS_3STATE || type == BS_AUTO3STATE) ? "check3" : (type == BS_CHECKBOX || type == BS_AUTOCHECKBOX) ? "check" : "other", (int)(st & 3), (st & BST_PUSHED) ? 1 : 0, (st & BST_FOCUS) ? 1 : 0);
    } else if (!lstrcmpiA(cls, "Edit")) {
        DWORD a = 0, b = 0; POINT caret = { -1, -1 };
        SendMessageA(h, EM_GETSEL, (WPARAM)&a, (LPARAM)&b);
        if (GetFocus() == h) GetCaretPos(&caret);
        put(" sel=%lu,%lu lines=%d first=%d length=%d caret=%d,%d modified=%d", a, b, (int)SendMessageA(h, EM_GETLINECOUNT, 0, 0), (int)SendMessageA(h, EM_GETFIRSTVISIBLELINE, 0, 0), (int)SendMessageA(h, WM_GETTEXTLENGTH, 0, 0), (int)caret.x, (int)caret.y, (int)SendMessageA(h, EM_GETMODIFY, 0, 0));
        if (style & ES_MULTILINE) put(" vpos=%d hpos=%d", GetScrollPos(h, SB_VERT), GetScrollPos(h, SB_HORZ));
    } else if (!lstrcmpiA(cls, "ListBox") || !lstrcmpiA(cls, "ComboLBox")) {
        int count = (int)SendMessageA(h, LB_GETCOUNT, 0, 0);
        put(" count=%d caret=%d top=%d", count, (int)SendMessageA(h, LB_GETCARETINDEX, 0, 0), (int)SendMessageA(h, LB_GETTOPINDEX, 0, 0));
        if (style & (LBS_EXTENDEDSEL | LBS_MULTIPLESEL)) {
            put(" anchor=%d sel=", (int)SendMessageA(h, LB_GETANCHORINDEX, 0, 0));
            for (i = 0, n = 0; i < count; i++) if (SendMessageA(h, LB_GETSEL, i, 0) > 0) put(n++ ? ",%d" : "%d", i);
            if (!n) put("none");
        } else put(" sel=%d", (int)SendMessageA(h, LB_GETCURSEL, 0, 0));
    } else if (!lstrcmpiA(cls, "ComboBox")) {
        DWORD sel = (DWORD)SendMessageA(h, CB_GETEDITSEL, 0, 0);
        put(" sel=%d dropped=%d count=%d top=%d editsel=%d,%d extended=%d", (int)SendMessageA(h, CB_GETCURSEL, 0, 0), (int)SendMessageA(h, CB_GETDROPPEDSTATE, 0, 0), (int)SendMessageA(h, CB_GETCOUNT, 0, 0),
            (int)SendMessageA(h, CB_GETTOPINDEX, 0, 0), (int)LOWORD(sel), (int)HIWORD(sel), (int)SendMessageA(h, CB_GETEXTENDEDUI, 0, 0));
    } else if (!lstrcmpiA(cls, "ScrollBar")) {
        SCROLLINFO si; si.cbSize = sizeof(si); si.fMask = SIF_ALL; GetScrollInfo(h, SB_CTL, &si);
        put(" pos=%d min=%d max=%d page=%u", si.nPos, si.nMin, si.nMax, si.nPage);
    } else if (!lstrcmpiA(cls, "SysTabControl32")) {
        put(" sel=%d tabfocus=%d count=%d rows=%d", (int)SendMessageA(h, TCM_GETCURSEL, 0, 0), (int)SendMessageA(h, TCM_GETCURFOCUS, 0, 0), (int)SendMessageA(h, TCM_GETITEMCOUNT, 0, 0), (int)SendMessageA(h, TCM_GETROWCOUNT, 0, 0));
    } else if (!lstrcmpiA(cls, "SysTreeView32")) {
        HTREEITEM item = (HTREEITEM)SendMessageA(h, TVM_GETNEXTITEM, TVGN_CARET, 0), walk; TV_ITEMA tv;
        put(" items=");
        for (walk = (HTREEITEM)SendMessageA(h, TVM_GETNEXTITEM, TVGN_ROOT, 0), n = 0; walk && n < 40; walk = (HTREEITEM)SendMessageA(h, TVM_GETNEXTITEM, TVGN_NEXTVISIBLE, (LPARAM)walk), n++) {
            ZeroMemory(&tv, sizeof(tv)); tv.mask = TVIF_TEXT | TVIF_STATE | TVIF_CHILDREN | TVIF_HANDLE; tv.hItem = walk; tv.stateMask = 0xffff; tv.pszText = text; tv.cchTextMax = sizeof(text);
            SendMessageA(h, TVM_GETITEMA, 0, (LPARAM)&tv);
            put("%s%s%s%s", n ? "|" : "", walk == item ? "*" : "", tv.cChildren ? ((tv.state & TVIS_EXPANDED) ? "[-]" : "[+]") : "", clean(text, 40));
        }
    } else if (!lstrcmpiA(cls, "SysListView32")) {
        int count = (int)SendMessageA(h, LVM_GETITEMCOUNT, 0, 0); LV_ITEMA lv;
        put(" count=%d lvfocus=%d top=%d sel=", count, (int)SendMessageA(h, LVM_GETNEXTITEM, (WPARAM)-1, LVNI_FOCUSED), (int)SendMessageA(h, LVM_GETTOPINDEX, 0, 0));
        for (i = -1, n = 0; (i = (int)SendMessageA(h, LVM_GETNEXTITEM, i, LVNI_SELECTED)) >= 0; n++) put(n ? ",%d" : "%d", i);
        if (!n) put("none");
        put(" order=");
        for (i = 0; i < count && i < 20; i++) { ZeroMemory(&lv, sizeof(lv)); lv.iSubItem = 0; lv.pszText = text; lv.cchTextMax = sizeof(text); SendMessageA(h, LVM_GETITEMTEXTA, i, (LPARAM)&lv); put("%s%s", i ? "|" : "", clean(text, 40)); }
    } else if (!lstrcmpiA(cls, "msctls_updown32")) {
        LRESULT pos = SendMessageA(h, UDM_GETPOS, 0, 0), range = SendMessageA(h, UDM_GETRANGE, 0, 0);
        put(" pos=%d error=%d min=%d max=%d", (int)(short)LOWORD(pos), (int)HIWORD(pos), (int)(short)HIWORD(range), (int)(short)LOWORD(range));
    } else if (!lstrcmpiA(cls, "msctls_trackbar32")) {
        put(" pos=%d min=%d max=%d line=%d page=%d", (int)SendMessageA(h, TBM_GETPOS, 0, 0), (int)SendMessageA(h, TBM_GETRANGEMIN, 0, 0), (int)SendMessageA(h, TBM_GETRANGEMAX, 0, 0), (int)SendMessageA(h, TBM_GETLINESIZE, 0, 0), (int)SendMessageA(h, TBM_GETPAGESIZE, 0, 0));
    } else if (!lstrcmpiA(cls, "ToolbarWindow32")) {
        TBBUTTON b; n = (int)SendMessageA(h, TB_BUTTONCOUNT, 0, 0);
        put(" buttons=");
        for (i = 0; i < n; i++) { SendMessageA(h, TB_GETBUTTON, i, (LPARAM)&b); put("%s%d:%02x", i ? "," : "", b.idCommand, (int)(BYTE)SendMessageA(h, TB_GETSTATE, b.idCommand, 0)); }
    } else if (!lstrcmpiA(cls, "SysHeader32")) {
        HDITEMA item; n = (int)SendMessageA(h, HDM_GETITEMCOUNT, 0, 0);
        put(" widths=");
        for (i = 0; i < n; i++) { item.mask = HDI_WIDTH; SendMessageA(h, HDM_GETITEMA, i, (LPARAM)&item); put(i ? ",%d" : "%d", item.cxy); }
    } else if (!lstrcmpiA(cls, "msctls_hotkey32")) {
        LRESULT k = SendMessageA(h, HKM_GETHOTKEY, 0, 0);
        put(" vk=%d mods=%d", (int)LOBYTE(LOWORD(k)), (int)HIBYTE(LOWORD(k)));
    } else if (!lstrcmpiA(cls, "refscene.scrollbox")) {
        put(" vpos=%d hpos=%d", GetScrollPos(h, SB_VERT), GetScrollPos(h, SB_HORZ));
    }
}

static BOOL CALLBACK stateChild(HWND h, LPARAM l)
{
    char cls[64], text[200]; int cell = cellOf(h);
    GetClassNameA(h, cls, sizeof(cls)); text[0] = 0; SendMessageA(h, WM_GETTEXT, sizeof(text), (LPARAM)text);
    put("c hwnd=%08lx parent=%08lx id=%d class=\"%s\" cell=%s enabled=%d visible=%d text=\"%s\"", (unsigned long)h, (unsigned long)GetParent(h), GetDlgCtrlID(h), cls, cell >= 0 ? cells[cell].id : "-", IsWindowEnabled(h) ? 1 : 0, IsWindowVisible(h) ? 1 : 0, clean(text, 100));
    putControlState(h);
    put("\r\n");
    return TRUE;
}

static HWND tops[32]; static int topN;
static BOOL CALLBACK collectTop(HWND h, LPARAM l) { if (IsWindowVisible(h) && h != hCtl && topN < 32) tops[topN++] = h; return TRUE; }
static void collectTops(void) { topN = 0; EnumThreadWindows(GetCurrentThreadId(), collectTop, 0); }

/* The highlighted position in a menu, or -1. */
static int hilite(HMENU m) { int i, n = GetMenuItemCount(m); for (i = 0; i < n; i++) if (GetMenuState(m, i, MF_BYPOSITION) & MF_HILITE) return i; return -1; }

static void putMenuState(void)
{
    int i, levels = 0, pos; char text[120]; HMENU bar = hFrame ? GetMenu(hFrame) : NULL;
    for (i = 0; i < topN; i++) if (isClass(tops[i], "#32768")) levels++;
    put("menu loop=%d levels=%d", inMenu, levels);
    if (bar) { pos = hilite(bar); text[0] = 0; if (pos >= 0) GetMenuStringA(bar, pos, text, sizeof(text), MF_BYPOSITION); put(" bar=%d bartext=\"%s\"", pos, clean(text, 60)); }
    put("\r\n");
    for (i = 0; i < chainN && i < levels; i++) {
        pos = hilite(chain[i]); text[0] = 0; if (pos >= 0) GetMenuStringA(chain[i], pos, text, sizeof(text), MF_BYPOSITION);
        put("ml level=%d name=%s hilite=%d text=\"%s\" flags=%04x\r\n", i, menuName(chain[i]), pos, clean(text, 80), pos >= 0 ? GetMenuState(chain[i], pos, MF_BYPOSITION) & 0xffff : 0);
    }
}

static void state(void)
{
    HWND active = GetActiveWindow(), focus = GetFocus(); POINT p; int i, ready; LRESULT def;
    collectTops();
    ready = built && scene > 0 && (modalDepth > 0 ? (active && active != hHost) : (timeGetTime() - builtAt > 400)) && pendingScene < 0;
    GetCursorPos(&p);
    put("q scene=%d ready=%d modal=%d t=%lu tick=%lu cursor=%d,%d shown=%d capture=%08lx foreground=%d\r\n", scene, ready, modalDepth, (unsigned long)timeGetTime(), (unsigned long)GetTickCount(), (int)p.x, (int)p.y, cursorShown, (unsigned long)GetCapture(), GetForegroundWindow() == active);
    putWindowLine("active", active);
    putWindowLine("focus", focus);
    if (active && (isClass(active, "#32770"))) { def = SendMessageA(active, DM_GETDEFID, 0, 0); put("def id=%d has=%d\r\n", (int)LOWORD(def), HIWORD(def) == DC_HASDEFID); }
    for (i = 0; i < topN; i++) if (tops[i] != hHost) putWindowLine("top", tops[i]);
    putMenuState();
    for (i = 0; i < topN; i++) EnumChildWindows(tops[i], stateChild, 0);
    if (evLen) { if (outLen + evLen < (int)sizeof(outBuf) - 8) { CopyMemory(outBuf + outLen, evBuf, evLen); outLen += evLen; } evLen = 0; }
}

/* ---- the D command: rectangles ---------------------------------------------------------------------------------- */

static void putRect(const char *key, const RECT *rc) { put("r %s=%d,%d,%d,%d\r\n", key, (int)rc->left, (int)rc->top, (int)(rc->right - rc->left), (int)(rc->bottom - rc->top)); }
static void toScreen(HWND h, RECT *rc) { MapWindowPoints(h, NULL, (POINT *)rc, 2); }

static void putParts(HWND h)
{
    char cls[64], key[96]; RECT rc; int i, n; unsigned long id = (unsigned long)h;
    GetClassNameA(h, cls, sizeof(cls));
    if (!lstrcmpiA(cls, "SysTabControl32")) {
        n = (int)SendMessageA(h, TCM_GETITEMCOUNT, 0, 0);
        for (i = 0; i < n; i++) if (SendMessageA(h, TCM_GETITEMRECT, i, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.item%d", id, i); putRect(key, &rc); }
        GetClientRect(h, &rc); SendMessageA(h, TCM_ADJUSTRECT, FALSE, (LPARAM)&rc); toScreen(h, &rc); wsprintfA(key, "%08lx.display", id); putRect(key, &rc);
    } else if (!lstrcmpiA(cls, "ToolbarWindow32")) {
        n = (int)SendMessageA(h, TB_BUTTONCOUNT, 0, 0);
        for (i = 0; i < n; i++) if (SendMessageA(h, TB_GETITEMRECT, i, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.button%d", id, i); putRect(key, &rc); }
    } else if (!lstrcmpiA(cls, "msctls_statusbar32")) {
        int b[3] = { 0, 0, 0 }; SendMessageA(h, SB_GETBORDERS, 0, (LPARAM)b); put("r %08lx.borders=%d,%d,%d,0\r\n", id, b[0], b[1], b[2]);
        for (i = 0; i < 4; i++) if (SendMessageA(h, SB_GETRECT, i, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.part%d", id, i); putRect(key, &rc); }
    } else if (!lstrcmpiA(cls, "SysHeader32")) {
        HDITEMA item; int x = 0; n = (int)SendMessageA(h, HDM_GETITEMCOUNT, 0, 0); GetClientRect(h, &rc); toScreen(h, &rc);
        for (i = 0; i < n; i++) { RECT part; item.mask = HDI_WIDTH; SendMessageA(h, HDM_GETITEMA, i, (LPARAM)&item); SetRect(&part, rc.left + x, rc.top, rc.left + x + item.cxy, rc.bottom); x += item.cxy; wsprintfA(key, "%08lx.item%d", id, i); putRect(key, &part); }
    } else if (!lstrcmpiA(cls, "msctls_trackbar32")) {
        SendMessageA(h, TBM_GETTHUMBRECT, 0, (LPARAM)&rc); toScreen(h, &rc); wsprintfA(key, "%08lx.thumb", id); putRect(key, &rc);
        SendMessageA(h, TBM_GETCHANNELRECT, 0, (LPARAM)&rc); toScreen(h, &rc); wsprintfA(key, "%08lx.channel", id); putRect(key, &rc);
    } else if (!lstrcmpiA(cls, "SysTreeView32")) {
        HTREEITEM walk;
        for (walk = (HTREEITEM)SendMessageA(h, TVM_GETNEXTITEM, TVGN_ROOT, 0), n = 0; walk && n < 40; walk = (HTREEITEM)SendMessageA(h, TVM_GETNEXTITEM, TVGN_NEXTVISIBLE, (LPARAM)walk), n++) {
            *(HTREEITEM *)&rc = walk; if (SendMessageA(h, TVM_GETITEMRECT, TRUE, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.text%d", id, n); putRect(key, &rc); }
            *(HTREEITEM *)&rc = walk; if (SendMessageA(h, TVM_GETITEMRECT, FALSE, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.row%d", id, n); putRect(key, &rc); }
        }
        put("r %08lx.indent=%d,0,0,0\r\n", id, (int)SendMessageA(h, TVM_GETINDENT, 0, 0));
    } else if (!lstrcmpiA(cls, "SysListView32")) {
        n = (int)SendMessageA(h, LVM_GETITEMCOUNT, 0, 0);
        for (i = 0; i < n && i < 12; i++) {
            rc.left = LVIR_BOUNDS; if (SendMessageA(h, LVM_GETITEMRECT, i, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.item%d", id, i); putRect(key, &rc); }
            rc.left = LVIR_ICON; if (SendMessageA(h, LVM_GETITEMRECT, i, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.icon%d", id, i); putRect(key, &rc); }
            rc.left = LVIR_LABEL; if (SendMessageA(h, LVM_GETITEMRECT, i, (LPARAM)&rc)) { toScreen(h, &rc); wsprintfA(key, "%08lx.label%d", id, i); putRect(key, &rc); }
        }
    } else if (!lstrcmpiA(cls, "ListBox") || !lstrcmpiA(cls, "ComboLBox")) {
        n = (int)SendMessageA(h, LB_GETCOUNT, 0, 0);
        for (i = (int)SendMessageA(h, LB_GETTOPINDEX, 0, 0); i < n && i < 12; i++) if (SendMessageA(h, LB_GETITEMRECT, i, (LPARAM)&rc) != LB_ERR) { toScreen(h, &rc); wsprintfA(key, "%08lx.item%d", id, i); putRect(key, &rc); }
        put("r %08lx.itemheight=%d,0,0,0\r\n", id, (int)SendMessageA(h, LB_GETITEMHEIGHT, 0, 0));
    } else if (!lstrcmpiA(cls, "ComboBox")) {
        if (SendMessageA(h, CB_GETDROPPEDCONTROLRECT, 0, (LPARAM)&rc)) { wsprintfA(key, "%08lx.dropped", id); putRect(key, &rc); }
        put("r %08lx.heights=%d,%d,0,0\r\n", id, (int)SendMessageA(h, CB_GETITEMHEIGHT, (WPARAM)-1, 0), (int)SendMessageA(h, CB_GETITEMHEIGHT, 0, 0));
    } else if (!lstrcmpiA(cls, "Edit")) {
        SendMessageA(h, EM_GETRECT, 0, (LPARAM)&rc); toScreen(h, &rc); wsprintfA(key, "%08lx.format", id); putRect(key, &rc);
    }
}

static BOOL CALLBACK dumpChild(HWND h, LPARAM l)
{
    char cls[64], text[200]; RECT rc, client; int cell = cellOf(h);
    GetClassNameA(h, cls, sizeof(cls)); text[0] = 0; SendMessageA(h, WM_GETTEXT, sizeof(text), (LPARAM)text);
    GetWindowRect(h, &rc); GetClientRect(h, &client); toScreen(h, &client);
    put("c hwnd=%08lx parent=%08lx id=%d class=\"%s\" cell=%s rect=%d,%d,%d,%d client=%d,%d,%d,%d style=%08lx ex=%08lx enabled=%d visible=%d text=\"%s\"\r\n", (unsigned long)h, (unsigned long)GetParent(h), GetDlgCtrlID(h), cls, cell >= 0 ? cells[cell].id : "-",
        (int)rc.left, (int)rc.top, (int)(rc.right - rc.left), (int)(rc.bottom - rc.top), (int)client.left, (int)client.top, (int)(client.right - client.left), (int)(client.bottom - client.top),
        (unsigned long)GetWindowLongA(h, GWL_STYLE), (unsigned long)GetWindowLongA(h, GWL_EXSTYLE), IsWindowEnabled(h) ? 1 : 0, IsWindowVisible(h) ? 1 : 0, clean(text, 120));
    putParts(h);
    return TRUE;
}

static void dumpMenu(const char *name, HWND owner, HMENU m, const RECT *window)
{
    int i, n = GetMenuItemCount(m), dx = 0, dy = 0; RECT item[24]; char text[120], key[64]; BOOL ok = TRUE;
    if (n <= 0 || n > 24) return;
    for (i = 0; i < n; i++) ok = ok && (GetMenuItemRect(owner, m, i, &item[i]) || GetMenuItemRect(NULL, m, i, &item[i]));
    if (!ok) { put("m name=%s items=unreadable\r\n", name); return; }
    /* Windows 95 answers for a pop-up relative to the owner's client corner. The items sit 3 pixels inside the menu window. */
    if (window) { dx = window->left + 3 - item[0].left; dy = window->top + 3 - item[0].top; put("m name=%s moved=%d,%d\r\n", name, dx, dy); }
    for (i = 0; i < n; i++) {
        UINT st = GetMenuState(m, i, MF_BYPOSITION); text[0] = 0; GetMenuStringA(m, i, text, sizeof(text), MF_BYPOSITION);
        OffsetRect(&item[i], dx, dy);
        put("m name=%s item=%d id=%d flags=%04x text=\"%s\"\r\n", name, i, (int)GetMenuItemID(m, i), st & 0xffff, clean(text, 80));
        wsprintfA(key, "menu.%s.item%d", name, i); putRect(key, &item[i]);
    }
}

static void dump(void)
{
    int i, k, levels = 0, d, c; RECT rc, client; HWND menus[8]; char cls[64], text[200], key[64];
    collectTops();
    put("d scene=%d\r\n", scene);
    for (i = 0; i < topN; i++) {
        HWND h = tops[i]; int cell = cellOf(h);
        GetClassNameA(h, cls, sizeof(cls)); text[0] = 0; GetWindowTextA(h, text, sizeof(text));
        GetWindowRect(h, &rc); GetClientRect(h, &client); toScreen(h, &client);
        put("w hwnd=%08lx owner=%08lx class=\"%s\" cell=%s rect=%d,%d,%d,%d client=%d,%d,%d,%d style=%08lx ex=%08lx text=\"%s\"\r\n", (unsigned long)h, (unsigned long)GetWindow(h, GW_OWNER), cls, h == hHost ? "host" : cell >= 0 ? cells[cell].id : "-",
            (int)rc.left, (int)rc.top, (int)(rc.right - rc.left), (int)(rc.bottom - rc.top), (int)client.left, (int)client.top, (int)(client.right - client.left), (int)(client.bottom - client.top),
            (unsigned long)GetWindowLongA(h, GWL_STYLE), (unsigned long)GetWindowLongA(h, GWL_EXSTYLE), clean(text, 120));
        if (!lstrcmpiA(cls, "#32768") && levels < 8) menus[levels++] = h;
        if (!lstrcmpiA(cls, "#32770")) { SetRect(&rc, 0, 0, 4, 8); MapDialogRect(h, &rc); put("r %08lx.baseunits=%d,%d,0,0\r\n", (unsigned long)h, (int)rc.right, (int)rc.bottom); }
        EnumChildWindows(h, dumpChild, 0);
    }
    /* Menus: the bar of the frame, then each open pop-up. EnumThreadWindows lists the newest (deepest) menu window first. */
    if (hFrame && GetMenu(hFrame)) dumpMenu("bar", hFrame, GetMenu(hFrame), NULL);
    for (k = 0; k < chainN && k < levels; k++) { GetWindowRect(menus[levels - 1 - k], &rc); wsprintfA(key, "menu.%s.window", menuName(chain[k])); putRect(key, &rc); dumpMenu(menuName(chain[k]), hFrame ? hFrame : hHost, chain[k], &rc); }
    /* Templates: the dialog-unit rectangle of each control of every template now on screen. */
    for (d = 0; d < NDLGS; d++) {
        HWND dlg = templateWnd[d];
        if (!dlg || !IsWindow(dlg) || !IsWindowVisible(dlg)) continue;
        put("t dialog=%s hwnd=%08lx units=%d,%d\r\n", dlgs[d].name, (unsigned long)dlg, dlgs[d].w, dlgs[d].h);
        for (c = 0; c < NCTLS; c++) if (!lstrcmpA(ctls[c].dlg, dlgs[d].name)) put("u dialog=%s id=%d hwnd=%08lx units=%d,%d,%d,%d\r\n", dlgs[d].name, ctls[c].id, (unsigned long)GetDlgItem(dlg, ctls[c].id), ctls[c].x, ctls[c].y, ctls[c].w, ctls[c].h);
    }
}

/* ---- building controls ---------------------------------------------------------------------------------------- */

static const char *const nato[] = { "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "Xray", "Yankee", "Zulu" };

/* Send `message` once for each "|"-separated item of `list` (or the 26 spelling-alphabet words); returns the number sent. */
static int addItems(HWND h, UINT message, const char *list, BOOL many)
{
    char item[80]; int n = 0, k;
    if (many) { for (n = 0; n < 26; n++) SendMessageA(h, message, 0, (LPARAM)nato[n]); return n; }
    while (*list) {
        for (k = 0; list[k] && list[k] != '|' && k < 79; k++) item[k] = list[k];
        item[k] = 0; SendMessageA(h, message, 0, (LPARAM)item); n++;
        list += k; if (*list == '|') list++;
    }
    return n;
}

static HWND child(const char *cls, const char *text, DWORD style, DWORD ex, const CELL *c, int id)
{
    return CreateWindowExA(ex, cls, text, WS_CHILD | WS_VISIBLE | style, c->x, c->y, c->w, c->h, hHost, (HMENU)id, hInst, NULL);
}

static const struct { const char *name; int size; } files[] = { { "Notes.txt", 3 }, { "Drawing.bmp", 28 }, { "Report.txt", 12 } };

static int CALLBACK compareFiles(LPARAM a, LPARAM b, LPARAM l)
{
    int r = sortColumn == 0 ? lstrcmpiA(files[a].name, files[b].name) : files[a].size - files[b].size;
    return sortAscending ? r : -r;
}

static HTREEITEM treeAdd(HWND h, HTREEITEM parent, const char *text, int image, UINT state)
{
    TV_INSERTSTRUCTA in; ZeroMemory(&in, sizeof(in));
    in.hParent = parent; in.hInsertAfter = TVI_LAST; in.item.mask = TVIF_TEXT | TVIF_STATE | (image >= 0 ? TVIF_IMAGE | TVIF_SELECTEDIMAGE : 0);
    in.item.pszText = (char *)text; in.item.iImage = in.item.iSelectedImage = image; in.item.state = state; in.item.stateMask = state;
    return (HTREEITEM)SendMessageA(h, TVM_INSERTITEMA, 0, (LPARAM)&in);
}

static void buildControl(int i)
{
    const CELL *c = &cells[i]; HWND h = NULL; int n, id = 100 + i; BOOL font = TRUE;
    switch (c->kind) {
    case K_BUTTON: h = child("BUTTON", c->text, c->a | WS_TABSTOP, 0, c, id); break;
    case K_STATIC: h = child("STATIC", c->text, c->a, 0, c, id); break;
    case K_EDIT:
        h = child("EDIT", c->text, c->a | WS_TABSTOP, WS_EX_CLIENTEDGE, c, id);
        if (h && (c->state & ST_MANY)) { static char big[2400]; big[0] = 0; for (n = 0; n < 26; n++) wsprintfA(big + lstrlenA(big), "%s is line %d of this longer text, which wraps.\r\n", nato[n], n + 1); SetWindowTextA(h, big); }
        break;
    case K_LISTBOX:
        h = child("LISTBOX", "", c->a | LBS_NOINTEGRALHEIGHT | LBS_NOTIFY | WS_TABSTOP, WS_EX_CLIENTEDGE, c, id);
        n = addItems(h, LB_ADDSTRING, c->text, c->state & ST_MANY);
        if (c->state & ST_SELECT) { if (c->a & (LBS_EXTENDEDSEL | LBS_MULTIPLESEL)) { int k; for (k = 0; k < n; k++) if (c->b & (1 << k)) SendMessageA(h, LB_SETSEL, TRUE, k); SendMessageA(h, LB_SETCARETINDEX, 0, 0); } else SendMessageA(h, LB_SETCURSEL, c->b, 0); }
        break;
    case K_COMBO:
        h = CreateWindowExA(0, "COMBOBOX", "", WS_CHILD | WS_VISIBLE | WS_VSCROLL | WS_TABSTOP | c->a, c->x, c->y, c->w, c->h + 110, hHost, (HMENU)id, hInst, NULL);
        if (h) SendMessageA(h, WM_SETFONT, (WPARAM)hFont, TRUE);
        addItems(h, CB_ADDSTRING, c->text, c->state & ST_MANY);
        if (c->state & ST_SELECT) SendMessageA(h, CB_SETCURSEL, c->b, 0);
        break;
    case K_SCROLLBAR: {
        SCROLLINFO si; si.cbSize = sizeof(si); si.fMask = SIF_RANGE | SIF_PAGE | SIF_POS; si.nMin = 0; si.nMax = 100; si.nPage = c->state & ST_PAGE ? 10 : 0; si.nPos = c->b;
        h = child("SCROLLBAR", "", c->a | WS_TABSTOP, 0, c, id);
        SetScrollInfo(h, SB_CTL, &si, TRUE);
        break; }
    case K_STATUS: {
        int parts[3]; parts[0] = c->w - 180; parts[1] = c->w - 90; parts[2] = -1; font = FALSE;
        h = child(STATUSCLASSNAMEA, "", c->a | CCS_NOPARENTALIGN | CCS_NORESIZE | CCS_NODIVIDER, 0, c, id);
        SendMessageA(h, SB_SETPARTS, 3, (LPARAM)parts); SendMessageA(h, SB_SETTEXTA, 0, (LPARAM)c->text); SendMessageA(h, SB_SETTEXTA, 1, (LPARAM)"Ln 1, Col 1"); SendMessageA(h, SB_SETTEXTA, 2 | SBT_POPOUT, (LPARAM)"Popout");
        break; }
    case K_PROGRESS: h = child(PROGRESS_CLASSA, "", c->a, 0, c, id); SendMessageA(h, PBM_SETRANGE, 0, MAKELPARAM(0, 100)); SendMessageA(h, PBM_SETPOS, c->b, 0); break;
    case K_TRACKBAR:
        h = child(TRACKBAR_CLASSA, "", c->a | WS_TABSTOP, 0, c, id);
        SendMessageA(h, TBM_SETRANGE, TRUE, MAKELPARAM(0, 100)); SendMessageA(h, TBM_SETTICFREQ, 10, 0); SendMessageA(h, TBM_SETPOS, TRUE, c->b);
        break;
    case K_UPDOWN:
        h = child("EDIT", "", ES_AUTOHSCROLL | WS_TABSTOP, WS_EX_CLIENTEDGE, c, id);
        if (h) SendMessageA(h, WM_SETFONT, (WPARAM)hFont, TRUE);
        cellAux[i] = CreateUpDownControl(WS_CHILD | WS_VISIBLE | c->a, 0, 0, 0, 0, hHost, id + 1000, hInst, h, 20, 1, c->b);
        if (c->state & ST_DISABLED) EnableWindow(cellAux[i], FALSE);
        break;
    case K_TAB: {
        char item[40]; const char *list = c->text; TC_ITEMA ti; int k;
        h = child(WC_TABCONTROLA, "", c->a | WS_TABSTOP, 0, c, id);
        if (h) SendMessageA(h, WM_SETFONT, (WPARAM)hFont, TRUE);
        for (n = 0; *list; n++) { for (k = 0; list[k] && list[k] != '|' && k < 39; k++) item[k] = list[k]; item[k] = 0; list += k; if (*list == '|') list++;
            ZeroMemory(&ti, sizeof(ti)); ti.mask = TCIF_TEXT; ti.pszText = item; SendMessageA(h, TCM_INSERTITEMA, n, (LPARAM)&ti); }
        SendMessageA(h, TCM_SETCURSEL, 0, 0);
        break; }
    case K_HEADER: {
        char item[40]; const char *list = c->text; HDITEMA hi; int k; HD_LAYOUT layout; RECT rc; WINDOWPOS wp;
        h = child(WC_HEADERA, "", c->a | HDS_HORZ, 0, c, id);
        if (h) SendMessageA(h, WM_SETFONT, (WPARAM)hFont, TRUE);
        for (n = 0; *list; n++) { for (k = 0; list[k] && list[k] != '|' && k < 39; k++) item[k] = list[k]; item[k] = 0; list += k; if (*list == '|') list++;
            ZeroMemory(&hi, sizeof(hi)); hi.mask = HDI_TEXT | HDI_WIDTH | HDI_FORMAT; hi.fmt = HDF_STRING | (n == 1 ? HDF_RIGHT : HDF_LEFT); hi.cxy = 80; hi.pszText = item; SendMessageA(h, HDM_INSERTITEMA, n, (LPARAM)&hi); }
        /* Let the header choose its own height, as it does at the top of a list view. */
        SetRect(&rc, 0, 0, c->w, 200); layout.prc = &rc; layout.pwpos = &wp;
        if (SendMessageA(h, HDM_LAYOUT, 0, (LPARAM)&layout)) MoveWindow(h, c->x, c->y, c->w, wp.cy, TRUE);
        break; }
    case K_TOOLBAR: {
        static const TBBUTTON buttons[] = {
            { STD_FILENEW, 3001, TBSTATE_ENABLED, TBSTYLE_BUTTON, { 0 }, 0, 0 }, { STD_FILEOPEN, 3002, TBSTATE_ENABLED | TBSTATE_PRESSED, TBSTYLE_BUTTON, { 0 }, 0, 0 },
            { STD_FILESAVE, 3003, TBSTATE_ENABLED, TBSTYLE_BUTTON, { 0 }, 0, 0 }, { 0, 0, TBSTATE_ENABLED, TBSTYLE_SEP, { 0 }, 0, 0 },
            { STD_CUT, 3004, TBSTATE_ENABLED | TBSTATE_CHECKED, TBSTYLE_CHECK, { 0 }, 0, 0 }, { STD_COPY, 3005, TBSTATE_ENABLED, TBSTYLE_CHECK, { 0 }, 0, 0 },
            { STD_PASTE, 3006, 0, TBSTYLE_BUTTON, { 0 }, 0, 0 }, { STD_PRINT, 3007, TBSTATE_ENABLED | TBSTATE_INDETERMINATE, TBSTYLE_BUTTON, { 0 }, 0, 0 },
            { 0, 0, TBSTATE_ENABLED, TBSTYLE_SEP, { 0 }, 0, 0 }, { STD_UNDO, 3008, TBSTATE_CHECKED, TBSTYLE_CHECK, { 0 }, 0, 0 }, { STD_HELP, 3009, TBSTATE_ENABLED, TBSTYLE_BUTTON, { 0 }, 0, 0 } };
        font = FALSE;
        h = CreateToolbarEx(hHost, WS_CHILD | WS_VISIBLE | TBSTYLE_TOOLTIPS | CCS_NOPARENTALIGN | CCS_NORESIZE | c->a, id, 15, HINST_COMMCTRL, IDB_STD_SMALL_COLOR, buttons, sizeof(buttons) / sizeof(buttons[0]), 0, 0, 0, 0, sizeof(TBBUTTON));
        if (h) MoveWindow(h, c->x, c->y, c->w, c->h, TRUE);
        break; }
    case K_TREE: {
        HTREEITEM docs, projects, pictures; int img = (c->state & ST_ICONS) ? 0 : -1;
        h = child(WC_TREEVIEWA, "", c->a | WS_TABSTOP, WS_EX_CLIENTEDGE, c, id);
        if (!h) break;
        if (c->state & ST_ICONS) SendMessageA(h, TVM_SETIMAGELIST, TVSIL_NORMAL, (LPARAM)hSmall);
        docs = treeAdd(h, TVI_ROOT, "Documents", img, 0);
        projects = treeAdd(h, docs, "Projects", img, 0);
        treeAdd(h, projects, "Sketches", img, 0); treeAdd(h, projects, "Letters", img, 0);
        treeAdd(h, docs, "Readme.txt", img, (c->state & ST_ICONS) ? TVIS_CUT : 0);
        pictures = treeAdd(h, TVI_ROOT, "Pictures", img, 0);
        treeAdd(h, pictures, "Holiday", img, 0);
        SendMessageA(h, TVM_EXPAND, TVE_EXPAND, (LPARAM)docs);
        SendMessageA(h, TVM_SELECTITEM, TVGN_CARET, (LPARAM)docs);
        break; }
    case K_LISTVIEW: {
        LV_COLUMNA col; LV_ITEMA item; char size[24];
        h = child(WC_LISTVIEWA, "", c->a | WS_TABSTOP, WS_EX_CLIENTEDGE, c, id);
        if (!h) break;
        SendMessageA(h, LVM_SETIMAGELIST, LVSIL_SMALL, (LPARAM)hSmall); SendMessageA(h, LVM_SETIMAGELIST, LVSIL_NORMAL, (LPARAM)hLarge);
        ZeroMemory(&col, sizeof(col)); col.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_FMT | LVCF_SUBITEM;
        col.fmt = LVCFMT_LEFT; col.cx = 150; col.pszText = "Name"; col.iSubItem = 0; SendMessageA(h, LVM_INSERTCOLUMNA, 0, (LPARAM)&col);
        col.fmt = LVCFMT_RIGHT; col.cx = 70; col.pszText = "Size"; col.iSubItem = 1; SendMessageA(h, LVM_INSERTCOLUMNA, 1, (LPARAM)&col);
        for (n = 0; n < 3; n++) {
            ZeroMemory(&item, sizeof(item)); item.mask = LVIF_TEXT | LVIF_PARAM | LVIF_IMAGE; item.iItem = n; item.pszText = (char *)files[n].name; item.lParam = n; item.iImage = 0;
            SendMessageA(h, LVM_INSERTITEMA, 0, (LPARAM)&item);
            wsprintfA(size, "%d KB", files[n].size); item.mask = LVIF_TEXT; item.iSubItem = 1; item.pszText = size; SendMessageA(h, LVM_SETITEMA, 0, (LPARAM)&item);
        }
        sortColumn = 0; sortAscending = 1; SendMessageA(h, LVM_SORTITEMS, 0, (LPARAM)compareFiles);
        ZeroMemory(&item, sizeof(item)); item.stateMask = LVIS_SELECTED | LVIS_FOCUSED; item.state = LVIS_SELECTED | LVIS_FOCUSED; SendMessageA(h, LVM_SETITEMSTATE, 0, (LPARAM)&item);
        break; }
    case K_HOTKEY: h = child(HOTKEY_CLASSA, "", WS_TABSTOP, WS_EX_CLIENTEDGE, c, id); SendMessageA(h, HKM_SETHOTKEY, MAKEWORD('K', HOTKEYF_CONTROL | HOTKEYF_SHIFT), 0); break;
    case K_SCROLLBOX: h = child("refscene.scrollbox", "", c->a | WS_TABSTOP, WS_EX_CLIENTEDGE, c, id); break;
    default: return;
    }
    cellWnd[i] = h;
    if (!h) { ev("failed cell=%s error=%lu", c->id, GetLastError()); return; }
    if (font) SendMessageA(h, WM_SETFONT, (WPARAM)hFont, TRUE);
    if (c->kind == K_EDIT && !(c->state & ST_MANY)) SetWindowTextA(h, c->text);
    if (c->state & ST_CHECKED) SendMessageA(h, BM_SETCHECK, 1, 0);
    if (c->state & ST_MIXED) SendMessageA(h, BM_SETCHECK, 2, 0);
    if (c->state & ST_DISABLED) EnableWindow(h, FALSE);
}

/* ---- the scroll box: a plain window with both of its own scroll bars ------------------------------------------- */

#define BOX_W 750
#define BOX_H 400

static void boxRange(HWND h)
{
    RECT rc; SCROLLINFO si; GetClientRect(h, &rc);
    si.cbSize = sizeof(si); si.fMask = SIF_RANGE | SIF_PAGE; si.nMin = 0;
    si.nMax = BOX_H - 1; si.nPage = rc.bottom; SetScrollInfo(h, SB_VERT, &si, TRUE);
    GetClientRect(h, &rc); si.nMax = BOX_W - 1; si.nPage = rc.right; SetScrollInfo(h, SB_HORZ, &si, TRUE);
}

static const char *scrollCode(int code)
{
    static const char *const names[] = { "lineup", "linedown", "pageup", "pagedown", "thumbposition", "thumbtrack", "top", "bottom", "endscroll" };
    return code >= 0 && code <= 8 ? names[code] : "other";
}

/* What an application does with a scroll message; `bar` is SB_HORZ, SB_VERT or SB_CTL. */
static void applyScroll(HWND h, int bar, WPARAM wp, int line)
{
    SCROLLINFO si; int pos, code = LOWORD(wp);
    si.cbSize = sizeof(si); si.fMask = SIF_ALL; GetScrollInfo(h, bar, &si); pos = si.nPos;
    switch (code) {
    case SB_LINEUP: pos -= line; break; case SB_LINEDOWN: pos += line; break;
    case SB_PAGEUP: pos -= si.nPage ? (int)si.nPage : 10; break; case SB_PAGEDOWN: pos += si.nPage ? (int)si.nPage : 10; break;
    case SB_THUMBTRACK: case SB_THUMBPOSITION: pos = si.nTrackPos; break;
    case SB_TOP: pos = si.nMin; break; case SB_BOTTOM: pos = si.nMax; break;
    }
    si.fMask = SIF_POS; si.nPos = pos; SetScrollInfo(h, bar, &si, TRUE);
}

static LRESULT CALLBACK boxProc(HWND h, UINT m, WPARAM wp, LPARAM lp)
{
    switch (m) {
    case WM_CREATE: case WM_SIZE: boxRange(h); break;
    case WM_LBUTTONDOWN: SetFocus(h); return 0;
    case WM_HSCROLL: case WM_VSCROLL: {
        int bar = m == WM_HSCROLL ? SB_HORZ : SB_VERT, before = GetScrollPos(h, bar);
        applyScroll(h, bar, wp, 10);
        ev("scroll window=scrollbox bar=%s code=%s pos=%d", bar == SB_HORZ ? "horz" : "vert", scrollCode(LOWORD(wp)), GetScrollPos(h, bar));
        if (GetScrollPos(h, bar) != before) InvalidateRect(h, NULL, TRUE);
        return 0; }
    case WM_KEYDOWN:   /* a plain window scrolls from the keyboard only if its program says so; this is the usual mapping */
        switch (wp) {
        case VK_UP: SendMessageA(h, WM_VSCROLL, SB_LINEUP, 0); break; case VK_DOWN: SendMessageA(h, WM_VSCROLL, SB_LINEDOWN, 0); break;
        case VK_PRIOR: SendMessageA(h, WM_VSCROLL, SB_PAGEUP, 0); break; case VK_NEXT: SendMessageA(h, WM_VSCROLL, SB_PAGEDOWN, 0); break;
        case VK_LEFT: SendMessageA(h, WM_HSCROLL, SB_LINEUP, 0); break; case VK_RIGHT: SendMessageA(h, WM_HSCROLL, SB_LINEDOWN, 0); break;
        case VK_HOME: SendMessageA(h, WM_VSCROLL, SB_TOP, 0); break; case VK_END: SendMessageA(h, WM_VSCROLL, SB_BOTTOM, 0); break;
        }
        return 0;
    case WM_PAINT: {
        PAINTSTRUCT ps; HDC dc = BeginPaint(h, &ps); int y, ox = GetScrollPos(h, SB_HORZ), oy = GetScrollPos(h, SB_VERT); RECT rc; HFONT old = SelectObject(dc, hFont);
        for (y = 29; y < BOX_H; y += 30) { SetRect(&rc, -ox, y - oy, BOX_W - ox, y - oy + 1); FillRect(dc, &rc, GetSysColorBrush(COLOR_3DLIGHT)); }
        SetBkMode(dc, TRANSPARENT); TextOutA(dc, 8 - ox, 8 - oy, "Wide document", 13); TextOutA(dc, 8 - ox, 368 - oy, "End of the sample document.", 27);
        SelectObject(dc, old); EndPaint(h, &ps); return 0; }
    }
    return DefWindowProcA(h, m, wp, lp);
}

/* ---- the scene window ------------------------------------------------------------------------------------------ */

static const char *notifyName(HWND from, int code)
{
    static char other[24];
    switch (code) {
    case NM_CLICK: return "nm_click"; case NM_DBLCLK: return "nm_dblclk"; case NM_RETURN: return "nm_return"; case NM_SETFOCUS: return "nm_setfocus"; case NM_KILLFOCUS: return "nm_killfocus"; case NM_RCLICK: return "nm_rclick";
    case TCN_SELCHANGE: return "tcn_selchange"; case TCN_SELCHANGING: return "tcn_selchanging"; case TCN_KEYDOWN: return "tcn_keydown";
    case TVN_SELCHANGEDA: return "tvn_selchanged"; case TVN_ITEMEXPANDEDA: return "tvn_itemexpanded"; case TVN_ITEMEXPANDINGA: return "tvn_itemexpanding"; case TVN_KEYDOWN: return "tvn_keydown";
    case LVN_ITEMCHANGED: return "lvn_itemchanged"; case LVN_COLUMNCLICK: return "lvn_columnclick"; case LVN_KEYDOWN: return "lvn_keydown";
    case HDN_ITEMCLICKA: return "hdn_itemclick"; case HDN_ITEMCHANGEDA: return "hdn_itemchanged"; case HDN_BEGINTRACKA: return "hdn_begintrack"; case HDN_ENDTRACKA: return "hdn_endtrack"; case HDN_DIVIDERDBLCLICKA: return "hdn_dividerdblclick";
    case UDN_DELTAPOS: return "udn_deltapos"; case TTN_NEEDTEXTA: return "ttn_needtext"; case TTN_SHOW: return "ttn_show"; case TTN_POP: return "ttn_pop";
    }
    wsprintfA(other, "code%d", code);
    return other;
}

static LRESULT CALLBACK hostProc(HWND h, UINT m, WPARAM wp, LPARAM lp)
{
    if (findMsg && m == findMsg) { ev("find flags=%08lx findnext=%d term=%d matchcase=%d down=%d text=\"%s\"", fr.Flags, (fr.Flags & FR_FINDNEXT) != 0, (fr.Flags & FR_DIALOGTERM) != 0, (fr.Flags & FR_MATCHCASE) != 0, (fr.Flags & FR_DOWN) != 0, clean(findWhat, 60)); if (fr.Flags & FR_DIALOGTERM) hDialog = NULL; return 0; }
    switch (m) {
    case WM_ERASEBKGND: { RECT rc; GetClientRect(h, &rc); FillRect((HDC)wp, &rc, GetSysColorBrush(COLOR_BTNFACE)); return 1; }
    case WM_COMMAND: { int cell = cellOf((HWND)lp); ev("command id=%d code=%d cell=%s", LOWORD(wp), HIWORD(wp), cell >= 0 ? cells[cell].id : "-"); return 0; }
    case WM_NOTIFY: {
        NMHDR *nm = (NMHDR *)lp; int cell = cellOf(nm->hwndFrom);
        if (nm->code == TTN_NEEDTEXTA) { static const char *const tips[] = { "New", "Open", "Save", "Cut", "Copy", "Paste", "Print", "Undo", "Help" }; TOOLTIPTEXTA *t = (TOOLTIPTEXTA *)lp; if (nm->idFrom >= 3001 && nm->idFrom <= 3009) t->lpszText = (char *)tips[nm->idFrom - 3001]; }
        if (nm->code == (UINT)LVN_GETDISPINFOA || nm->code == (UINT)TVN_GETDISPINFOA) break;
        if (nm->code == (UINT)LVN_COLUMNCLICK) { NM_LISTVIEW *lv = (NM_LISTVIEW *)lp; sortAscending = lv->iSubItem == sortColumn ? !sortAscending : 1; sortColumn = lv->iSubItem; SendMessageA(nm->hwndFrom, LVM_SORTITEMS, 0, (LPARAM)compareFiles); ev("notify cell=%s code=lvn_columnclick column=%d ascending=%d", cell >= 0 ? cells[cell].id : "-", sortColumn, sortAscending); return 0; }
        if (nm->code == (UINT)UDN_DELTAPOS) { NM_UPDOWN *ud = (NM_UPDOWN *)lp; ev("notify cell=%s code=udn_deltapos pos=%d delta=%d", cell >= 0 ? cells[cell].id : "-", ud->iPos, ud->iDelta); return 0; }
        if (nm->code == (UINT)LVN_ITEMCHANGED) { NM_LISTVIEW *lv = (NM_LISTVIEW *)lp; ev("notify cell=%s code=lvn_itemchanged item=%d new=%04x old=%04x", cell >= 0 ? cells[cell].id : "-", lv->iItem, lv->uNewState, lv->uOldState); return 0; }
        if (nm->code == (UINT)HDN_ITEMCLICKA) { HD_NOTIFYA *hd = (HD_NOTIFYA *)lp; ev("notify cell=%s code=hdn_itemclick item=%d", cell >= 0 ? cells[cell].id : "-", hd->iItem); return 0; }
        ev("notify cell=%s id=%d code=%s sincemove=%lu", cell >= 0 ? cells[cell].id : "-", (int)nm->idFrom, notifyName(nm->hwndFrom, nm->code), (unsigned long)(timeGetTime() - lastMove));
        return 0; }
    case WM_HSCROLL: case WM_VSCROLL: {
        HWND from = (HWND)lp; int cell = cellOf(from); int pos = 0;
        if (from && isClass(from, "ScrollBar")) { applyScroll(from, SB_CTL, wp, 1); pos = GetScrollPos(from, SB_CTL); }
        else if (from && isClass(from, "msctls_trackbar32")) pos = (int)SendMessageA(from, TBM_GETPOS, 0, 0);
        else if (from && isClass(from, "msctls_updown32")) pos = (int)(short)LOWORD(SendMessageA(from, UDM_GETPOS, 0, 0));
        ev("scroll cell=%s bar=%s code=%s pos=%d", cell >= 0 ? cells[cell].id : "-", m == WM_HSCROLL ? "horz" : "vert", scrollCode(LOWORD(wp)), pos);
        return 0; }
    case WM_CLOSE: return 0;
    case WM_QUERYENDSESSION: return TRUE;
    }
    return DefWindowProcA(h, m, wp, lp);
}

/* ---- the frame window with its menus ---------------------------------------------------------------------------- */

static BOOL isSubmenuOf(HMENU parent, HMENU sub) { int i, n = GetMenuItemCount(parent); for (i = 0; i < n; i++) if (GetSubMenu(parent, i) == sub) return TRUE; return FALSE; }

static LRESULT CALLBACK frameProc(HWND h, UINT m, WPARAM wp, LPARAM lp)
{
    switch (m) {
    case WM_ENTERMENULOOP: inMenu = 1; chainN = 0; ev("entermenuloop popup=%d", (int)wp); break;
    case WM_EXITMENULOOP: inMenu = 0; chainN = 0; ev("exitmenuloop"); break;
    case WM_INITMENUPOPUP: {
        HMENU menu = (HMENU)wp; int k;
        for (k = chainN - 1; k >= 0; k--) if (isSubmenuOf(chain[k], menu)) break;
        chainN = k + 1; if (chainN < 8) chain[chainN++] = menu;
        ev("initmenupopup menu=%s level=%d sincemove=%lu", menuName(menu), chainN - 1, (unsigned long)(timeGetTime() - lastMove));
        break; }
    case WM_MENUSELECT: {
        UINT flags = HIWORD(wp), item = LOWORD(wp); HMENU menu = (HMENU)lp; char text[120]; text[0] = 0;
        if (flags == 0xffff && !menu) { ev("menuselect closed"); break; }
        GetMenuStringA(menu, item, text, sizeof(text), (flags & MF_POPUP) ? MF_BYPOSITION : MF_BYCOMMAND);
        ev("menuselect menu=%s item=%u flags=%04x mouse=%d text=\"%s\"", menuName(menu), item, flags, (flags & MF_MOUSESELECT) != 0, clean(text, 80));
        break; }
    case WM_MENUCHAR: ev("menuchar char=%d type=%04x menu=%s", (int)LOWORD(wp), (int)HIWORD(wp), menuName((HMENU)lp)); break;
    case WM_COMMAND: {
        int id = LOWORD(wp);
        ev("command id=%d source=%s", id, HIWORD(wp) == 1 ? "accelerator" : "menu");
        if (id == IDM_GRID || id == IDM_STATUSBAR || id == IDM_TOOLBAR || id == IDM_TOOLTIPS) CheckMenuItem(hView, id, MF_BYCOMMAND | ((GetMenuState(hView, id, MF_BYCOMMAND) & MF_CHECKED) ? MF_UNCHECKED : MF_CHECKED));
        if (id == IDM_ZOOM100 || id == IDM_ZOOM200) CheckMenuRadioItem(hZoom, IDM_ZOOM100, IDM_ZOOM200, id, MF_BYCOMMAND);
        if (hMdiClient) break;
        return 0; }
    case WM_SYSCOMMAND: ev("syscommand %04x", (int)(wp & 0xfff0)); break;
    case WM_CONTEXTMENU: {
        POINT p; BOOL keyboard = (lp == -1);
        if ((HWND)wp != h || !hContext) break;
        p.x = (short)LOWORD(lp); p.y = (short)HIWORD(lp);
        if (keyboard) { p.x = 12; p.y = 24; ClientToScreen(h, &p); }
        ev("contextmenu x=%d y=%d keyboard=%d", (int)p.x, (int)p.y, keyboard);
        TrackPopupMenu(hContext, TPM_LEFTALIGN | TPM_TOPALIGN | TPM_RIGHTBUTTON, p.x, p.y, 0, h, NULL);
        return 0; }
    case WM_ENTERSIZEMOVE: ev("entersizemove"); break;
    case WM_EXITSIZEMOVE: { RECT rc; GetWindowRect(h, &rc); ev("exitsizemove rect=%d,%d,%d,%d", (int)rc.left, (int)rc.top, (int)(rc.right - rc.left), (int)(rc.bottom - rc.top)); break; }
    case WM_SIZE: ev("size type=%d w=%d h=%d", (int)wp, (int)LOWORD(lp), (int)HIWORD(lp)); break;
    case WM_ERASEBKGND: if (!hMdiClient) { RECT rc; GetClientRect(h, &rc); FillRect((HDC)wp, &rc, GetSysColorBrush(COLOR_WINDOW)); return 1; } break;
    case WM_CLOSE: ev("close"); return 0;
    }
    if (hMdiClient && h == hFrame) return DefFrameProcA(h, hMdiClient, m, wp, lp);
    return DefWindowProcA(h, m, wp, lp);
}

static LRESULT CALLBACK mdiChildProc(HWND h, UINT m, WPARAM wp, LPARAM lp)
{
    switch (m) {
    case WM_SYSCOMMAND: { char t[40]; GetWindowTextA(h, t, sizeof(t)); ev("child syscommand %04x window=\"%s\"", (int)(wp & 0xfff0), clean(t, 30)); break; }
    case WM_MDIACTIVATE: { char t[40]; GetWindowTextA(h, t, sizeof(t)); if ((HWND)lp == h) ev("mdiactivate window=\"%s\"", clean(t, 30)); break; }
    case WM_SIZE: { char t[40]; GetWindowTextA(h, t, sizeof(t)); ev("child size type=%d window=\"%s\"", (int)wp, clean(t, 30)); break; }
    case WM_CLOSE: ev("child close"); return 0;
    }
    return DefMDIChildProcA(h, m, wp, lp);
}

static void buildMenus(BOOL mdi)
{
    hFile = CreatePopupMenu(); hEdit = CreatePopupMenu(); hView = CreatePopupMenu(); hZoom = CreatePopupMenu(); hCustom = CreatePopupMenu(); hHelp = CreatePopupMenu(); hBar = CreateMenu();
    AppendMenuA(hFile, MF_STRING, IDM_NEW, "&New\tCtrl+N"); AppendMenuA(hFile, MF_STRING, IDM_OPEN, "&Open...\tCtrl+O"); AppendMenuA(hFile, MF_STRING | MF_GRAYED, IDM_SAVE, "&Save\tCtrl+S");
    AppendMenuA(hFile, MF_SEPARATOR, 0, NULL); AppendMenuA(hFile, MF_STRING, IDM_MRU1, "&1 Letter.txt"); AppendMenuA(hFile, MF_STRING, IDM_MRU2, "&2 Sketch.bmp");
    AppendMenuA(hFile, MF_SEPARATOR, 0, NULL); AppendMenuA(hFile, MF_STRING, IDM_EXIT, "E&xit");
    AppendMenuA(hEdit, MF_STRING | MF_GRAYED, IDM_UNDO, "&Undo\tCtrl+Z"); AppendMenuA(hEdit, MF_SEPARATOR, 0, NULL); AppendMenuA(hEdit, MF_STRING, IDM_CUT, "Cu&t\tCtrl+X");
    AppendMenuA(hEdit, MF_STRING, IDM_COPY, "&Copy\tCtrl+C"); AppendMenuA(hEdit, MF_STRING | MF_GRAYED, IDM_PASTE, "&Paste\tCtrl+V"); AppendMenuA(hEdit, MF_SEPARATOR, 0, NULL); AppendMenuA(hEdit, MF_STRING, IDM_FIND, "&Find...");
    AppendMenuA(hCustom, MF_STRING, IDM_FITPAGE, "&Fit Page"); AppendMenuA(hCustom, MF_STRING, IDM_WHOLEPAGE, "&Whole Page");
    AppendMenuA(hZoom, MF_STRING, IDM_ZOOM100, "&100%"); AppendMenuA(hZoom, MF_STRING, IDM_ZOOM200, "&200%"); AppendMenuA(hZoom, MF_POPUP, (UINT)hCustom, "&Custom"); CheckMenuRadioItem(hZoom, IDM_ZOOM100, IDM_ZOOM200, IDM_ZOOM100, MF_BYCOMMAND);
    AppendMenuA(hView, MF_STRING | MF_CHECKED, IDM_GRID, "&Grid"); AppendMenuA(hView, MF_POPUP, (UINT)hZoom, "&Zoom"); AppendMenuA(hView, MF_SEPARATOR, 0, NULL);
    AppendMenuA(hView, MF_STRING | MF_CHECKED, IDM_STATUSBAR, "&Status Bar"); AppendMenuA(hView, MF_STRING, IDM_TOOLBAR, "&Toolbar"); AppendMenuA(hView, MF_STRING, IDM_TOOLTIPS, "&Tool Tips");
    AppendMenuA(hHelp, MF_STRING, IDM_ABOUT, "&About Example...");
    AppendMenuA(hBar, MF_POPUP, (UINT)hFile, "&File"); AppendMenuA(hBar, MF_POPUP, (UINT)hEdit, "&Edit"); AppendMenuA(hBar, MF_POPUP, (UINT)hView, "&View");
    if (mdi) { hWindowMenu = CreatePopupMenu(); AppendMenuA(hWindowMenu, MF_STRING, IDM_CASCADE, "&Cascade"); AppendMenuA(hWindowMenu, MF_STRING, IDM_TILE, "&Tile"); AppendMenuA(hBar, MF_POPUP, (UINT)hWindowMenu, "&Window"); }
    AppendMenuA(hBar, MF_POPUP, (UINT)hHelp, "&Help");
    hContext = CreatePopupMenu();
    AppendMenuA(hContext, MF_STRING, IDM_CTX_OPEN, "&Open document"); AppendMenuA(hContext, MF_STRING, IDM_CTX_RENAME, "&Rename..."); AppendMenuA(hContext, MF_STRING | MF_GRAYED, IDM_CTX_DELETE, "&Delete (locked)");
}

static void buildFrame(int i, BOOL mdi)
{
    const CELL *c = &cells[i]; static const ACCEL keys[] = { { FCONTROL | FVIRTKEY, 'N', IDM_NEW }, { FCONTROL | FVIRTKEY, 'O', IDM_OPEN }, { FCONTROL | FVIRTKEY, 'C', IDM_COPY } };
    buildMenus(mdi);
    hAccel = CreateAcceleratorTableA((ACCEL *)keys, sizeof(keys) / sizeof(keys[0]));
    hFrame = CreateWindowExA(0, "refscene.frame", c->text, c->a | WS_CLIPCHILDREN, c->x, c->y, c->w, c->h, hHost, hBar, hInst, NULL);
    cellWnd[i] = hFrame;
    if (!hFrame) return;
    if (mdi) {
        CLIENTCREATESTRUCT ccs; MDICREATESTRUCTA mcs; int n; static const char *const titles[] = { "Letter.txt", "Sketch.bmp" };
        ccs.hWindowMenu = hWindowMenu; ccs.idFirstChild = IDM_FIRSTCHILD;
        hMdiClient = CreateWindowExA(WS_EX_CLIENTEDGE, "MDICLIENT", NULL, WS_CHILD | WS_CLIPCHILDREN | WS_VISIBLE, 0, 0, 0, 0, hFrame, (HMENU)1, hInst, &ccs);
        ShowWindow(hFrame, SW_SHOW);
        for (n = 0; n < 2; n++) { ZeroMemory(&mcs, sizeof(mcs)); mcs.szClass = "refscene.mdichild"; mcs.szTitle = titles[n]; mcs.hOwner = hInst; mcs.x = 10 + n * 24; mcs.y = 10 + n * 24; mcs.cx = 260; mcs.cy = 160; SendMessageA(hMdiClient, WM_MDICREATE, 0, (LPARAM)&mcs); }
    } else ShowWindow(hFrame, SW_SHOW);
    SetForegroundWindow(hFrame);
}

/* ---- dialogs from templates ------------------------------------------------------------------------------------- */

static WORD *wide(WORD *p, const char *s) { while (*s) *p++ = (BYTE)*s++; *p++ = 0; return p; }
static WORD *align4(WORD *p) { return (WORD *)(((DWORD)p + 3) & ~3); }

/* Builds a DLGTEMPLATE for the named row set of cells.def. The memory is never freed (a property sheet keeps using it). */
static DLGTEMPLATE *makeTemplate(const char *name)
{
    int d, c, count = 0; WORD *p; DLGTEMPLATE *t; DLGITEMTEMPLATE *item;
    for (d = 0; d < NDLGS; d++) if (!lstrcmpA(dlgs[d].name, name)) break;
    if (d == NDLGS) return NULL;
    t = (DLGTEMPLATE *)GlobalAlloc(GPTR, 8192);
    for (c = 0; c < NCTLS; c++) if (!lstrcmpA(ctls[c].dlg, name)) count++;
    t->style = dlgs[d].style | DS_SETFONT; t->cdit = (WORD)count; t->cx = (short)dlgs[d].w; t->cy = (short)dlgs[d].h;
    p = (WORD *)(t + 1); *p++ = 0; *p++ = 0; p = wide(p, dlgs[d].caption); *p++ = 8; p = wide(p, "MS Sans Serif");
    for (c = 0; c < NCTLS; c++) if (!lstrcmpA(ctls[c].dlg, name)) {
        /* List items are written in the text column; a list box or combo box has no caption of its own. */
        BOOL list = !lstrcmpiA(ctls[c].cls, "LISTBOX") || !lstrcmpiA(ctls[c].cls, "COMBOBOX");
        p = align4(p); item = (DLGITEMTEMPLATE *)p;
        item->style = ctls[c].style | WS_CHILD | WS_VISIBLE; item->dwExtendedStyle = 0; item->x = (short)ctls[c].x; item->y = (short)ctls[c].y; item->cx = (short)ctls[c].w; item->cy = (short)ctls[c].h; item->id = (WORD)ctls[c].id;
        p = (WORD *)(item + 1); p = wide(p, ctls[c].cls); p = wide(p, list ? "" : ctls[c].text); *p++ = 0;
    }
    return t;
}

static void fillLists(HWND dlg, const char *name)
{
    int c, d;
    for (d = 0; d < NDLGS; d++) if (!lstrcmpA(dlgs[d].name, name)) templateWnd[d] = dlg;   /* called from each template's WM_INITDIALOG */
    for (c = 0; c < NCTLS; c++) if (!lstrcmpA(ctls[c].dlg, name)) {
        HWND h = GetDlgItem(dlg, ctls[c].id);
        if (!lstrcmpiA(ctls[c].cls, "LISTBOX")) { addItems(h, LB_ADDSTRING, ctls[c].text, FALSE); SendMessageA(h, LB_SETCURSEL, 0, 0); }
        if (!lstrcmpiA(ctls[c].cls, "COMBOBOX")) { addItems(h, CB_ADDSTRING, ctls[c].text, FALSE); SendMessageA(h, CB_SETCURSEL, 0, 0); }
    }
}

static BOOL CALLBACK formProc(HWND h, UINT m, WPARAM wp, LPARAM lp)
{
    switch (m) {
    case WM_INITDIALOG:
        initing = 1; fillLists(h, "form");
        CheckRadioButton(h, 111, 114, 111); CheckDlgButton(h, 122, 1); CheckDlgButton(h, 124, 1); CheckDlgButton(h, 121, 2);
        initing = 0;
        return TRUE;
    case WM_COMMAND: if (!initing) ev("command dialog=form id=%d code=%d", LOWORD(wp), HIWORD(wp)); return TRUE;
    case WM_CLOSE: ev("close dialog=form"); return FALSE;   /* the dialog manager turns this into IDCANCEL itself; the dialog is never destroyed */
    }
    return FALSE;
}

static const char *psnName(int code)
{
    static char other[24];
    switch (code) {
    case PSN_SETACTIVE: return "psn_setactive"; case PSN_KILLACTIVE: return "psn_killactive"; case PSN_APPLY: return "psn_apply"; case PSN_RESET: return "psn_reset";
    case PSN_HELP: return "psn_help"; case PSN_WIZBACK: return "psn_wizback"; case PSN_WIZNEXT: return "psn_wiznext"; case PSN_WIZFINISH: return "psn_wizfinish"; case PSN_QUERYCANCEL: return "psn_querycancel";
    }
    wsprintfA(other, "code%d", code);
    return other;
}

/* One procedure for every property sheet and wizard page; lParam of the page is the index into pageNames. */
static const char *const pageNames[] = { "page_general", "page_layout", "wiz_name", "wiz_template", "wiz_review" };

static BOOL CALLBACK pageProc(HWND h, UINT m, WPARAM wp, LPARAM lp)
{
    switch (m) {
    case WM_INITDIALOG: {
        int page = (int)((PROPSHEETPAGEA *)lp)->lParam;
        SetWindowLongA(h, GWL_USERDATA, page);
        initing++; fillLists(h, pageNames[page]);
        if (page == 0) SetDlgItemTextA(h, 201, appliedTitle);
        if (page == 1) SendDlgItemMessageA(h, 211, CB_SELECTSTRING, (WPARAM)-1, (LPARAM)appliedOrientation);
        initing--; pageReady[page] = 1;
        ev("page init page=%s", pageNames[page]);
        return TRUE; }
    case WM_COMMAND: {
        int id = LOWORD(wp), code = HIWORD(wp), page = (int)GetWindowLongA(h, GWL_USERDATA);
        if (initing || !pageReady[page]) return TRUE;   /* an edit control announces the text its template gave it before WM_INITDIALOG */
        ev("command page=%s id=%d code=%d", pageNames[page], id, code);
        if (page < 2 && ((id == 201 && code == EN_CHANGE) || (id == 211 && code == CBN_SELCHANGE) || ((id == 202 || id == 212) && code == BN_CLICKED))) { SendMessageA(GetParent(h), PSM_CHANGED, (WPARAM)h, 0); ev("psm_changed page=%s", pageNames[page]); }
        return TRUE; }
    case WM_NOTIFY: {
        NMHDR *nm = (NMHDR *)lp; int page = (int)GetWindowLongA(h, GWL_USERDATA); HWND sheet = GetParent(h);
        if ((int)nm->code > PSN_FIRST || (int)nm->code < PSN_LAST) return FALSE;
        ev("notify page=%s code=%s", pageNames[page], psnName(nm->code));
        switch (nm->code) {
        case PSN_APPLY:
            if (page == 0) GetDlgItemTextA(h, 201, appliedTitle, sizeof(appliedTitle));
            if (page == 1) GetDlgItemTextA(h, 211, appliedOrientation, sizeof(appliedOrientation));
            ev("applied page=%s title=\"%s\" orientation=\"%s\"", pageNames[page], clean(appliedTitle, 40), clean(appliedOrientation, 20));
            SetWindowLongA(h, DWL_MSGRESULT, PSNRET_NOERROR); return TRUE;
        case PSN_SETACTIVE:
            if (page >= 2) SendMessageA(sheet, PSM_SETWIZBUTTONS, 0, page == 2 ? PSWIZB_NEXT : page == 3 ? PSWIZB_BACK | PSWIZB_NEXT : PSWIZB_BACK | PSWIZB_FINISH);
            SetWindowLongA(h, DWL_MSGRESULT, 0); return TRUE;
        case PSN_WIZNEXT:
            if (page == 2 && !GetWindowTextLengthA(GetDlgItem(h, 302))) { ev("wizard stays: the name is empty"); SetFocus(GetDlgItem(h, 302)); SetWindowLongA(h, DWL_MSGRESULT, -1); return TRUE; }
            SetWindowLongA(h, DWL_MSGRESULT, 0); return TRUE;
        case PSN_KILLACTIVE: case PSN_QUERYCANCEL: case PSN_WIZBACK: case PSN_WIZFINISH: SetWindowLongA(h, DWL_MSGRESULT, 0); return TRUE;
        }
        return FALSE; }
    }
    return FALSE;
}

/* ---- modal scenes ------------------------------------------------------------------------------------------------ */

static void runModal(int i)
{
    const CELL *c = &cells[i]; int result = 0; DWORD extended = 0;
    modalDepth++;
    ev("modal begin cell=%s", c->id);
    if (c->kind == K_MSGBOX) result = MessageBoxA(hHost, c->text, "Example", c->a);
    else if (c->kind == K_PROPSHEET) {
        PROPSHEETHEADERA psh; PROPSHEETPAGEA pages[3]; int n, first = c->a ? 2 : 0, count = c->a ? 3 : 2;
        ZeroMemory(pages, sizeof(pages)); ZeroMemory(&psh, sizeof(psh));
        for (n = 0; n < count; n++) { pages[n].dwSize = sizeof(PROPSHEETPAGEA); pages[n].dwFlags = PSP_DLGINDIRECT; pages[n].hInstance = hInst; pages[n].pResource = makeTemplate(pageNames[first + n]); pages[n].pfnDlgProc = pageProc; pages[n].lParam = first + n; }
        psh.dwSize = sizeof(PROPSHEETHEADERA); psh.dwFlags = PSH_PROPSHEETPAGE | (c->a ? PSH_WIZARD : 0); psh.hwndParent = hHost; psh.hInstance = hInst; psh.pszCaption = c->text; psh.nPages = count; psh.ppsp = pages;
        result = PropertySheetA(&psh);
    } else if (c->kind == K_COMDLG) {
        static char file[MAX_PATH]; static COLORREF custom[16];
        if (c->a == 1 || c->a == 2) {
            OPENFILENAMEA ofn; ZeroMemory(&ofn, sizeof(ofn)); lstrcpyA(file, c->a == 2 ? "notes.txt" : "");
            ofn.lStructSize = sizeof(ofn); ofn.hwndOwner = hHost; ofn.lpstrFilter = "Text Documents (*.txt)\0*.txt\0All Files (*.*)\0*.*\0"; ofn.lpstrFile = file; ofn.nMaxFile = sizeof(file); ofn.lpstrInitialDir = dir;
            ofn.Flags = OFN_EXPLORER | OFN_HIDEREADONLY | (c->a == 1 ? OFN_FILEMUSTEXIST : OFN_OVERWRITEPROMPT);
            result = c->a == 1 ? GetOpenFileNameA(&ofn) : GetSaveFileNameA(&ofn);
            ev("file=\"%s\"", clean(file, 100));
        } else if (c->a == 3) {
            CHOOSEFONTA cf; LOGFONTA lf; ZeroMemory(&cf, sizeof(cf)); GetObjectA(hFont, sizeof(lf), &lf);
            cf.lStructSize = sizeof(cf); cf.hwndOwner = hHost; cf.lpLogFont = &lf; cf.Flags = CF_SCREENFONTS | CF_EFFECTS | CF_INITTOLOGFONTSTRUCT;
            result = ChooseFontA(&cf);
            ev("font face=\"%s\" pointsize=%d weight=%d italic=%d", clean(lf.lfFaceName, 32), cf.iPointSize, (int)lf.lfWeight, lf.lfItalic);
        } else if (c->a == 4) {
            CHOOSECOLORA cc; ZeroMemory(&cc, sizeof(cc));
            cc.lStructSize = sizeof(cc); cc.hwndOwner = hHost; cc.rgbResult = RGB(0, 0, 128); cc.lpCustColors = custom; cc.Flags = CC_RGBINIT;
            result = ChooseColorA(&cc);
            ev("color result=#%02x%02x%02x", GetRValue(cc.rgbResult), GetGValue(cc.rgbResult), GetBValue(cc.rgbResult));
        } else if (c->a == 5) {
            PRINTDLGA pd; ZeroMemory(&pd, sizeof(pd));
            pd.lStructSize = sizeof(pd); pd.hwndOwner = hHost; pd.Flags = PD_ALLPAGES | PD_NOSELECTION; pd.nFromPage = 1; pd.nToPage = 1; pd.nMinPage = 1; pd.nMaxPage = 9; pd.nCopies = 1;
            result = PrintDlgA(&pd);
        } else if (c->a == 7) {
            PAGESETUPDLGA ps; ZeroMemory(&ps, sizeof(ps));
            ps.lStructSize = sizeof(ps); ps.hwndOwner = hHost;
            result = PageSetupDlgA(&ps);
        }
        extended = CommDlgExtendedError();
    }
    modalDepth--;
    ev("modal end cell=%s result=%d extended=%lu", c->id, result, extended);
}

/* ---- scenes ------------------------------------------------------------------------------------------------------ */

static void destroyScene(void)
{
    int i;
    if (hDialog) { DestroyWindow(hDialog); hDialog = NULL; }
    if (hFrame) { DestroyWindow(hFrame); hFrame = NULL; hMdiClient = NULL; }   /* takes the menu bar and the MDI children with it */
    for (i = 0; i < NCELLS; i++) { if (cellAux[i]) DestroyWindow(cellAux[i]); if (cellWnd[i] && IsWindow(cellWnd[i])) DestroyWindow(cellWnd[i]); cellAux[i] = cellWnd[i] = NULL; }
    if (hContext) { DestroyMenu(hContext); hContext = NULL; }
    if (hAccel) { DestroyAcceleratorTable(hAccel); hAccel = NULL; }
    hBar = hFile = hEdit = hView = hZoom = hCustom = hHelp = hWindowMenu = NULL; chainN = 0; inMenu = 0; built = 0;
    RedrawWindow(hHost, NULL, NULL, RDW_INVALIDATE | RDW_ERASE | RDW_UPDATENOW);
}

static void buildScene(int n)
{
    int i, modal = -1;
    scene = n; evLen = 0;
    lstrcpyA(appliedTitle, "Untitled"); lstrcpyA(appliedOrientation, "Portrait"); ZeroMemory(pageReady, sizeof(pageReady)); ZeroMemory(templateWnd, sizeof(templateWnd));
    SetForegroundWindow(hHost); SetActiveWindow(hHost); SetFocus(hHost);
    for (i = 0; i < NCELLS; i++) {
        const CELL *c = &cells[i];
        if (c->sheet != n) continue;
        switch (c->kind) {
        case K_FRAME: buildFrame(i, FALSE); break;
        case K_MDI: buildFrame(i, TRUE); break;
        case K_DIALOG:
            hDialog = CreateDialogIndirectParamA(hInst, makeTemplate(c->text), hHost, formProc, 0);
            cellWnd[i] = hDialog;
            if (hDialog) { SetWindowPos(hDialog, NULL, c->x, c->y, 0, 0, SWP_NOSIZE | SWP_NOZORDER); ShowWindow(hDialog, SW_SHOW); SetForegroundWindow(hDialog); }
            break;
        case K_MSGBOX: case K_PROPSHEET: modal = i; break;
        case K_COMDLG:
            if (c->a == 6) {
                ZeroMemory(&fr, sizeof(fr)); lstrcpyA(findWhat, c->text);
                fr.lStructSize = sizeof(fr); fr.hwndOwner = hHost; fr.Flags = FR_DOWN; fr.lpstrFindWhat = findWhat; fr.wFindWhatLen = sizeof(findWhat);
                hDialog = FindTextA(&fr); cellWnd[i] = hDialog;
            } else modal = i;
            break;
        default: buildControl(i);
        }
    }
    built = 1; builtAt = timeGetTime();
    ev("scene %d built", n);
    if (modal >= 0) runModal(modal);
}

/* Ask whatever modal thing is running to end, so the next scene can start from the top-level message loop. */
static void cancelModal(void)
{
    HWND active = GetActiveWindow();
    if (inMenu) { if (hFrame) SendMessageA(hFrame, WM_CANCELMODE, 0, 0); if (active) SendMessageA(active, WM_CANCELMODE, 0, 0); }
    if (GetCapture()) ReleaseCapture();
    if (modalDepth > 0 && active && active != hHost && active != hCtl) {
        if (isClass(active, "#32770") && scene >= 10 && scene <= 16) EndDialog(active, 0);
        else PostMessageA(active, WM_COMMAND, IDCANCEL, 0);
    }
}

static void tryScene(void)
{
    if (pendingScene < 0) return;
    if (modalDepth > 0 || inMenu) { cancelModal(); SetTimer(hCtl, TIMER_RETRY, 250, NULL); return; }
    KillTimer(hCtl, TIMER_RETRY);
    destroyScene();
    { int n = pendingScene; pendingScene = -1; buildScene(n); }
}

/* ---- input log: every key and button message this thread takes from its queue, in whichever loop takes it ---- */

static HHOOK hookGet, hookFilter;

static void logInput(const MSG *msg, const char *where)
{
    static UINT lastMessage; static DWORD lastTime; static WPARAM lastWp; const char *name; char cls[64];
    if (msg->message == WM_MOUSEMOVE || msg->message == WM_NCMOUSEMOVE) { lastMove = timeGetTime(); return; }
    switch (msg->message) {
    case WM_KEYDOWN: name = "keydown"; break; case WM_KEYUP: name = "keyup"; break; case WM_SYSKEYDOWN: name = "syskeydown"; break; case WM_SYSKEYUP: name = "syskeyup"; break;
    case WM_LBUTTONDOWN: name = "lbuttondown"; break; case WM_LBUTTONUP: name = "lbuttonup"; break; case WM_LBUTTONDBLCLK: name = "lbuttondblclk"; break;
    case WM_RBUTTONDOWN: name = "rbuttondown"; break; case WM_RBUTTONUP: name = "rbuttonup"; break;
    case WM_NCLBUTTONDOWN: name = "nclbuttondown"; break; case WM_NCLBUTTONUP: name = "nclbuttonup"; break; case WM_NCRBUTTONDOWN: name = "ncrbuttondown"; break; case WM_NCRBUTTONUP: name = "ncrbuttonup"; break;
    default: return;
    }
    if (msg->message == lastMessage && msg->time == lastTime && msg->wParam == lastWp) return;   /* seen already (a peek, or both hooks) */
    lastMessage = msg->message; lastTime = msg->time; lastWp = msg->wParam;
    cls[0] = 0; if (msg->hwnd) GetClassNameA(msg->hwnd, cls, sizeof(cls));
    ev("input %s vk=%d repeat=%d tick=%lu class=\"%s\" loop=%s", name, (msg->message >= WM_KEYFIRST && msg->message <= WM_KEYLAST) ? (int)msg->wParam : 0, (msg->message == WM_KEYDOWN || msg->message == WM_SYSKEYDOWN) ? (int)((msg->lParam >> 30) & 1) : 0, (unsigned long)msg->time, cls, where);
}
static LRESULT CALLBACK getHook(int code, WPARAM wp, LPARAM lp) { if (code >= 0) logInput((MSG *)lp, "queue"); return CallNextHookEx(hookGet, code, wp, lp); }
static LRESULT CALLBACK filterHook(int code, WPARAM wp, LPARAM lp)
{
    if (code >= 0) logInput((MSG *)lp, code == MSGF_MENU ? "menu" : code == MSGF_DIALOGBOX ? "dialog" : code == MSGF_SCROLLBAR ? "scrollbar" : "modal");
    return CallNextHookEx(hookFilter, code, wp, lp);
}

/* ---- commands ---------------------------------------------------------------------------------------------------- */

static int number(const char **s) { int n = 0, sign = 1; while (**s == ' ') (*s)++; if (**s == '-') { sign = -1; (*s)++; } while (**s >= '0' && **s <= '9') n = n * 10 + *(*s)++ - '0'; return n * sign; }

static void execute(const char *line)
{
    const char *args = line + 1; int i;
    switch (line[0]) {
    case 'P': put("pong refscene 1 scenes=%d\r\n", (int)NCELLS); break;
    case 'I': info(); break;
    case 'S': pendingScene = number(&args); put("ok scene %d pending\r\n", pendingScene); flushOut(); PostMessageA(hCtl, WM_APP_SCENE, 0, 0); return;
    case 'Q': state(); break;
    case 'D': dump(); break;
    case 'F': while (*args == ' ') args++;
        for (i = 0; i < NCELLS; i++) if (cells[i].sheet == scene && !lstrcmpA(cells[i].id, args)) break;
        if (i < NCELLS && cellWnd[i]) { SetForegroundWindow(GetParent(cellWnd[i]) ? GetParent(cellWnd[i]) : cellWnd[i]); SetFocus(cellWnd[i]); put("ok focus %s\r\n", cells[i].id); } else put("error no such control\r\n");
        break;
    case 'M': { int x = number(&args), y = number(&args); SetCursorPos(x, y); put("ok pointer %d,%d\r\n", x, y); break; }
    case 'V': { int show = number(&args); if (show != cursorShown) { ShowCursor(show); cursorShown = show; } put("ok\r\n"); break; }
    case 'X': put("ok exit\r\n"); flushOut(); pendingScene = -1; cancelModal(); PostQuitMessage(0); return;
    case 'Z': put("ok shutdown\r\n"); flushOut(); ExitWindowsEx(EWX_SHUTDOWN | EWX_FORCE, 0); return;
    default: put("error unknown command\r\n");
    }
    flushOut();
}

static void poll(void)
{
    static char line[200]; static int length; char buf[256], cmd[200]; DWORD got = 0, i;
    static DWORD received, polls, comError; static int debug = -1;
    if (debug < 0) debug = GetPrivateProfileIntA("refgrid", "debug", 0, iniPath);
    polls++;
    /* The port can be refused while Windows is still starting; keep asking. */
    if (hCom == INVALID_HANDLE_VALUE && !(polls % 20)) { openCom(); comError = hCom == INVALID_HANDLE_VALUE ? GetLastError() : 0; }
    if (debug && !(polls % 10)) {   /* a status line on the scene window, for finding out why nothing answers */
        char status[160]; HDC dc = GetDC(hHost); DWORD errors = 0; COMSTAT cs; ZeroMemory(&cs, sizeof(cs));
        if (hCom != INVALID_HANDLE_VALUE) ClearCommError(hCom, &errors, &cs);
        wsprintfA(status, "refscene com=%s error=%lu polls=%lu received=%lu inqueue=%lu commerr=%lx   ", hCom == INVALID_HANDLE_VALUE ? "closed" : "open", comError, polls, received, cs.cbInQue, errors);
        TextOutA(dc, 4, SCREEN_H - 18, status, lstrlenA(status)); ReleaseDC(hHost, dc);
    }
    if (hCom == INVALID_HANDLE_VALUE) return;
    while (ReadFile(hCom, buf, sizeof(buf), &got, NULL) && got) {
        received += got;
        for (i = 0; i < got; i++) {
            char ch = buf[i];
            if (ch == '\r') continue;
            if (ch != '\n') { if (length < (int)sizeof(line) - 1) line[length++] = ch; continue; }
            line[length] = 0; length = 0;
            lstrcpyA(cmd, line);
            if (cmd[0]) execute(cmd);
        }
    }
}

static LRESULT CALLBACK ctlProc(HWND h, UINT m, WPARAM wp, LPARAM lp)
{
    switch (m) {
    case WM_TIMER: if (wp == TIMER_POLL) poll(); else if (wp == TIMER_RETRY) tryScene(); return 0;
    case WM_APP_SCENE: tryScene(); return 0;
    case WM_QUERYENDSESSION: return TRUE;
    }
    return DefWindowProcA(h, m, wp, lp);
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR commandLine, int show)
{
    WNDCLASSA wc; MSG msg; char *slash;
    hInst = instance;
    GetModuleFileNameA(NULL, dir, sizeof(dir));
    for (slash = dir + lstrlenA(dir); slash > dir && slash[-1] != '\\'; slash--) ;
    *slash = 0;
    wsprintfA(iniPath, "%sREFGRID.INI", dir);
    if (applyDisplayMode()) return 0;

    InitCommonControls();
    hFont = GetStockObject(DEFAULT_GUI_FONT);
    findMsg = RegisterWindowMessageA(FINDMSGSTRINGA);
    hSmall = ImageList_Create(16, 16, ILC_COLOR | ILC_MASK, 2, 2); ImageList_AddIcon(hSmall, LoadIconA(NULL, IDI_APPLICATION));
    hLarge = ImageList_Create(32, 32, ILC_COLOR | ILC_MASK, 2, 2); ImageList_AddIcon(hLarge, LoadIconA(NULL, IDI_APPLICATION));

    ZeroMemory(&wc, sizeof(wc)); wc.hInstance = instance; wc.hCursor = LoadCursorA(NULL, IDC_ARROW);
    wc.lpfnWndProc = ctlProc; wc.lpszClassName = "refscene.ctl"; RegisterClassA(&wc);
    wc.lpfnWndProc = hostProc; wc.lpszClassName = "refscene.host"; RegisterClassA(&wc);
    wc.lpfnWndProc = boxProc; wc.lpszClassName = "refscene.scrollbox"; wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1); RegisterClassA(&wc);
    wc.hbrBackground = NULL; wc.hIcon = LoadIconA(NULL, IDI_APPLICATION);
    wc.lpfnWndProc = frameProc; wc.lpszClassName = "refscene.frame"; RegisterClassA(&wc);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1); wc.lpfnWndProc = mdiChildProc; wc.lpszClassName = "refscene.mdichild"; RegisterClassA(&wc);

    hCtl = CreateWindowExA(0, "refscene.ctl", "refscene control", WS_POPUP, 0, 0, 0, 0, NULL, NULL, instance, NULL);
    hHost = CreateWindowExA(WS_EX_TOPMOST, "refscene.host", "refscene", WS_POPUP | WS_CLIPCHILDREN, 0, 0, SCREEN_W, SCREEN_H, NULL, NULL, instance, NULL);
    if (!hCtl || !hHost) return 1;
    ShowWindow(hHost, SW_SHOW); UpdateWindow(hHost);
    openCom();
    if (GetPrivateProfileIntA("refgrid", "hooks", 1, iniPath)) {
        hookGet = SetWindowsHookExA(WH_GETMESSAGE, getHook, NULL, GetCurrentThreadId());
        hookFilter = SetWindowsHookExA(WH_MSGFILTER, filterHook, NULL, GetCurrentThreadId());
    }
    SetTimer(hCtl, TIMER_POLL, 50, NULL);
    while (GetMessageA(&msg, NULL, 0, 0) > 0) {
        if (hMdiClient && TranslateMDISysAccel(hMdiClient, &msg)) continue;
        if (hFrame && hAccel && TranslateAcceleratorA(hFrame, hAccel, &msg)) continue;
        if (hDialog && IsWindow(hDialog) && IsDialogMessageA(hDialog, &msg)) continue;
        TranslateMessage(&msg); DispatchMessageA(&msg);
    }
    if (hCom != INVALID_HANDLE_VALUE) CloseHandle(hCom);
    return 0;
}
