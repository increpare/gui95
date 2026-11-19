/*
 * refgrid: draws a fixed grid of Windows control states so a screen dump of it can be measured.
 *
 * Target: Windows 95, original release (4.00.950), comctl32 4.00. Everything used here exists there; in
 * particular no structure with a size field that grew in later Windows (MENUITEMINFO, the Vista NONCLIENTMETRICS)
 * is passed at its newer size.
 *
 * One borderless 640 by 480 window at the top left of the screen shows one "sheet" of cells at a time. The cells
 * come from cells.def. Commands arrive as keys (the capture script sends them through the emulator):
 *   1 2 3   show that sheet        X   exit the program        Q   shut Windows down
 * The capture script presses Esc first, which closes the pop-up menu on sheet 3 so that the next key reaches us.
 *
 * When a sheet has finished drawing, a marker appears at the top left: five 8 by 8 squares,
 *   red (or yellow if something failed), three squares giving the sheet number in binary (white 1, black 0), blue.
 * The capture script polls the screen dump for that marker, so no serial port or network is needed.
 *
 * REFGRID.TXT, written beside the program, records the numbers: system colours, metrics, fonts, dialog units
 * and the measured rectangle of every control. REFGRID.INI beside the program may ask for a display mode:
 *   [refgrid]
 *   bits=16      ; 0 or absent leaves the display alone
 *   width=800
 *   height=600
 */
#define WINVER 0x0400
#define _WIN32_WINNT 0x0400
#define _WIN32_WINDOWS 0x0400
#define _WIN32_IE 0x0200
#include <stdarg.h>
#include <windows.h>
#include <commctrl.h>

#define GRID_W 640
#define GRID_H 480
#define SHEETS 3

#include "cells.h"   /* the kinds, ST_* flags and CELL; shared with refscene */

/* cells.def also holds refscene's dialog templates and its sheets 4 and up; refgrid shows sheets 1 to 3 only. */
#define DLG(name, w, h, style, caption)
#define CTL(dlg, id, cls, x, y, w, h, style, text)
static const CELL cells[] = {
#define CELL(sheet, id, kind, x, y, w, h, a, b, state, text) { sheet, #id, kind, x, y, w, h, (DWORD)(a), (DWORD)(b), state, text },
#include "cells.def"
#undef CELL
};
#define NCELLS (sizeof(cells) / sizeof(cells[0]))

#define WM_APP_MENU (WM_APP + 1)
#define WM_APP_CMD  (WM_APP + 2)
#define TIMER_READY 1
#define READY_DELAY_MS 1500

static HINSTANCE hInst;
static HWND hGrid;
static HWND cellWnd[NCELLS];   /* the window made for a cell on the current sheet, if any */
static HWND cellAux[NCELLS];   /* a second window belonging to the cell (the up-down beside its buddy) */
static int sheet = 1, ready = 0, failed = 0, menuOpen = 0;
static HMENU hPopup, hSub;
static HWND hMenuOwner;
static HFONT fonts[FONT_COUNT];
static char dir[MAX_PATH], iniPath[MAX_PATH], txtPath[MAX_PATH];
static char modeNote[160] = "not requested";

/* ---- the report ---------------------------------------------------------------------------------------- */

static char fixedPart[24000];           /* sections that do not depend on the sheet */
static char sheetPart[SHEETS][12000];   /* one section per sheet, filled when that sheet becomes ready */
static char *out; static int outLeft;

static void put(const char *fmt, ...)
{
    char line[1100]; int n; va_list ap;
    va_start(ap, fmt); n = wvsprintfA(line, fmt, ap); va_end(ap);
    if (n > outLeft) n = outLeft;
    CopyMemory(out, line, n); out += n; outLeft -= n; *out = 0;
}
static void target(char *buffer, int size) { out = buffer; outLeft = size - 1; *out = 0; }

static void writeReport(void)
{
    HANDLE f = CreateFileA(txtPath, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    DWORD done; int i;
    if (f == INVALID_HANDLE_VALUE) { failed = 1; return; }
    WriteFile(f, fixedPart, lstrlenA(fixedPart), &done, NULL);
    for (i = 0; i < SHEETS; i++) WriteFile(f, sheetPart[i], lstrlenA(sheetPart[i]), &done, NULL);
    FlushFileBuffers(f);
    CloseHandle(f);
}

static const char *const colorNames[25] = { "COLOR_SCROLLBAR", "COLOR_BACKGROUND", "COLOR_ACTIVECAPTION", "COLOR_INACTIVECAPTION",
    "COLOR_MENU", "COLOR_WINDOW", "COLOR_WINDOWFRAME", "COLOR_MENUTEXT", "COLOR_WINDOWTEXT", "COLOR_CAPTIONTEXT",
    "COLOR_ACTIVEBORDER", "COLOR_INACTIVEBORDER", "COLOR_APPWORKSPACE", "COLOR_HIGHLIGHT", "COLOR_HIGHLIGHTTEXT",
    "COLOR_BTNFACE", "COLOR_BTNSHADOW", "COLOR_GRAYTEXT", "COLOR_BTNTEXT", "COLOR_INACTIVECAPTIONTEXT",
    "COLOR_BTNHIGHLIGHT", "COLOR_3DDKSHADOW", "COLOR_3DLIGHT", "COLOR_INFOTEXT", "COLOR_INFOBK" };

#define M(name) { #name, name }
static const struct { const char *name; int index; } metrics[] = {
    M(SM_CXSCREEN), M(SM_CYSCREEN), M(SM_CXVSCROLL), M(SM_CYHSCROLL), M(SM_CYCAPTION), M(SM_CXBORDER), M(SM_CYBORDER),
    M(SM_CXDLGFRAME), M(SM_CYDLGFRAME), M(SM_CYVTHUMB), M(SM_CXHTHUMB), M(SM_CXICON), M(SM_CYICON), M(SM_CXCURSOR),
    M(SM_CYCURSOR), M(SM_CYMENU), M(SM_CXFULLSCREEN), M(SM_CYFULLSCREEN), M(SM_CYVSCROLL), M(SM_CXHSCROLL), M(SM_CXMIN),
    M(SM_CYMIN), M(SM_CXSIZE), M(SM_CYSIZE), M(SM_CXFRAME), M(SM_CYFRAME), M(SM_CXMINTRACK), M(SM_CYMINTRACK),
    M(SM_CXDOUBLECLK), M(SM_CYDOUBLECLK), M(SM_CXICONSPACING), M(SM_CYICONSPACING), M(SM_CXEDGE), M(SM_CYEDGE),
    M(SM_CXMINSPACING), M(SM_CYMINSPACING), M(SM_CXSMICON), M(SM_CYSMICON), M(SM_CYSMCAPTION), M(SM_CXSMSIZE),
    M(SM_CYSMSIZE), M(SM_CXMENUSIZE), M(SM_CYMENUSIZE), M(SM_CXMINIMIZED), M(SM_CYMINIMIZED), M(SM_CXMENUCHECK),
    M(SM_CYMENUCHECK), M(SM_CXDRAG), M(SM_CYDRAG), M(SM_SLOWMACHINE), M(SM_CLEANBOOT)
};
#undef M

static const char *const fontNames[FONT_COUNT] = { "DEFAULT_GUI_FONT", "lfCaptionFont", "lfSmCaptionFont", "lfMenuFont", "lfStatusFont", "lfMessageFont", "SYSTEM_FONT" };

/* The NONCLIENTMETRICS of Windows 95 ends at lfMessageFont; later headers may append a field Windows 95 rejects. */
#define NCM_SIZE_95 (FIELD_OFFSET(NONCLIENTMETRICSA, lfMessageFont) + sizeof(LOGFONTA))

static void putLogFont(const char *name, const LOGFONTA *lf)
{
    put("%s=face \"%s\" height %d width %d weight %d italic %d charset %d quality %d pitch %d\r\n", name, lf->lfFaceName,
        (int)lf->lfHeight, (int)lf->lfWidth, (int)lf->lfWeight, lf->lfItalic, lf->lfCharSet, lf->lfQuality, lf->lfPitchAndFamily);
}

static void putVersionOfFile(const char *name, char *path)
{
    DWORD zero, size; static BYTE block[4096]; VS_FIXEDFILEINFO *info; UINT length;
    size = GetFileVersionInfoSizeA(path, &zero);
    if (!size || size > sizeof(block) || !GetFileVersionInfoA(path, 0, size, block) || !VerQueryValueA(block, "\\", (void **)&info, &length)) { put("%s=no version resource (%s)\r\n", name, path); return; }
    put("%s=%d.%d.%d.%d (%s)\r\n", name, HIWORD(info->dwFileVersionMS), LOWORD(info->dwFileVersionMS), HIWORD(info->dwFileVersionLS), LOWORD(info->dwFileVersionLS), path);
}

/* The version of a library this program has loaded. */
static void putFileVersion(const char *module)
{
    char path[MAX_PATH]; HMODULE h = GetModuleHandleA(module);
    if (!h || !GetModuleFileNameA(h, path, sizeof(path))) { put("%s=not loaded\r\n", module); return; }
    putVersionOfFile(module, path);
}

/* The version of a file in the Windows system directory: the 16-bit halves of the window manager and GDI live there. */
static void putSystemFileVersion(const char *file)
{
    char path[MAX_PATH + 16]; UINT n = GetSystemDirectoryA(path, MAX_PATH);
    if (!n || n >= MAX_PATH) { put("%s=no system directory\r\n", file); return; }
    wsprintfA(path + n, "\\%s", file);
    putVersionOfFile(file, path);
}

static BOOL CALLBACK emptyDialogProc(HWND h, UINT m, WPARAM w, LPARAM l) { return FALSE; }

/* Dialog base units for an 8-point MS Sans Serif dialog, measured the way a dialog measures them. */
static void putDialogUnits(void)
{
    static const WCHAR face[] = L"MS Sans Serif";
    WORD buffer[64]; DLGTEMPLATE *t = (DLGTEMPLATE *)buffer; WORD *p; HWND dlg; RECT rc; LONG base = GetDialogBaseUnits();
    ZeroMemory(buffer, sizeof(buffer));
    t->style = DS_SETFONT | WS_POPUP; t->cx = 100; t->cy = 100;
    p = (WORD *)(t + 1); *p++ = 0; *p++ = 0; *p++ = 0; *p++ = 8;       /* no menu, default class, empty title, 8 point */
    CopyMemory(p, face, sizeof(face));
    put("\r\n[dialogunits]\r\nGetDialogBaseUnits=%d x %d (the System font)\r\n", LOWORD(base), HIWORD(base));
    dlg = CreateDialogIndirectParamA(hInst, t, hGrid, emptyDialogProc, 0);
    if (!dlg) { put("ms_sans_serif_8=dialog could not be created (error %d)\r\n", (int)GetLastError()); return; }
    SetRect(&rc, 0, 0, 4, 8); MapDialogRect(dlg, &rc);
    put("ms_sans_serif_8.4x8_dlu=%d x %d px\r\n", (int)rc.right, (int)rc.bottom);
    SetRect(&rc, 0, 0, 400, 800); MapDialogRect(dlg, &rc);
    put("ms_sans_serif_8.400x800_dlu=%d x %d px\r\n", (int)rc.right, (int)rc.bottom);
    SetRect(&rc, 0, 0, 50, 14); MapDialogRect(dlg, &rc);
    put("ms_sans_serif_8.button_50x14_dlu=%d x %d px\r\n", (int)rc.right, (int)rc.bottom);
    DestroyWindow(dlg);
}

static void buildFixedPart(void)
{
    OSVERSIONINFOA v; NONCLIENTMETRICSA ncm; HDC dc = GetDC(NULL); int i; RECT work; LOGFONTA lf; BOOL flag; int border;
    HMODULE ntdll = GetModuleHandleA("ntdll.dll");
    FARPROC wine = ntdll ? GetProcAddress(ntdll, "wine_get_version") : NULL;
    HMODULE comctl = GetModuleHandleA("comctl32.dll");

    target(fixedPart, sizeof(fixedPart));
    put("; refgrid report. Numbers read from the running system; the screen dump holds the pixels.\r\n[system]\r\n");
    v.dwOSVersionInfoSize = sizeof(v);
    if (GetVersionExA(&v)) put("version=%d.%d build %d platform %d csd \"%s\"\r\n", (int)v.dwMajorVersion, (int)v.dwMinorVersion, (int)LOWORD(v.dwBuildNumber), (int)v.dwPlatformId, v.szCSDVersion);
    if (wine) put("wine=%s\r\n; THIS IS WINE, NOT WINDOWS. Nothing in this report or its screen dump is evidence about Windows 95.\r\n", ((const char *(*)(void))wine)());
    else put("wine=no\r\n");
    putFileVersion("comctl32.dll"); putFileVersion("user32.dll"); putFileVersion("gdi32.dll"); putFileVersion("kernel32.dll");
    putSystemFileVersion("user.exe"); putSystemFileVersion("gdi.exe"); putSystemFileVersion("shell32.dll");
    put("comctl32.DllGetVersion=%s\r\n", comctl && GetProcAddress(comctl, "DllGetVersion") ? "present (4.70 or later: Internet Explorer 3 or later has replaced the common controls)" : "absent (the original 4.00 library)");
    put("screen=%d x %d\r\nbitspixel=%d\r\nplanes=%d\r\nlogpixels=%d x %d\r\npalette=%s\r\nsizepalette=%d\r\nnumcolors=%d\r\n",
        GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN), GetDeviceCaps(dc, BITSPIXEL), GetDeviceCaps(dc, PLANES),
        GetDeviceCaps(dc, LOGPIXELSX), GetDeviceCaps(dc, LOGPIXELSY), GetDeviceCaps(dc, RASTERCAPS) & RC_PALETTE ? "yes" : "no",
        GetDeviceCaps(dc, SIZEPALETTE), GetDeviceCaps(dc, NUMCOLORS));
    put("displaymode=%s\r\n", modeNote);

    put("\r\n[syscolors]\r\n; index name=#rrggbb, then the colour the display actually shows for it (GetNearestColor)\r\n");
    for (i = 0; i < 25; i++) {
        COLORREF c = GetSysColor(i), n = GetNearestColor(dc, c);
        put("%d %s=#%02x%02x%02x shown #%02x%02x%02x\r\n", i, colorNames[i], GetRValue(c), GetGValue(c), GetBValue(c), GetRValue(n), GetGValue(n), GetBValue(n));
    }

    put("\r\n[metrics]\r\n");
    for (i = 0; i < sizeof(metrics) / sizeof(metrics[0]); i++) put("%s=%d\r\n", metrics[i].name, GetSystemMetrics(metrics[i].index));

    put("\r\n[parameters]\r\n");
    if (SystemParametersInfoA(SPI_GETBORDER, 0, &border, 0)) put("SPI_GETBORDER=%d\r\n", border);
    if (SystemParametersInfoA(SPI_GETWORKAREA, 0, &work, 0)) put("SPI_GETWORKAREA=%d,%d,%d,%d\r\n", (int)work.left, (int)work.top, (int)work.right, (int)work.bottom);
    if (SystemParametersInfoA(SPI_GETFONTSMOOTHING, 0, &flag, 0)) put("SPI_GETFONTSMOOTHING=%d\r\n", flag); else put("SPI_GETFONTSMOOTHING=not supported\r\n");
    if (SystemParametersInfoA(SPI_GETICONTITLELOGFONT, sizeof(lf), &lf, 0)) putLogFont("SPI_GETICONTITLELOGFONT", &lf);

    put("\r\n[nonclientmetrics]\r\n");
    ZeroMemory(&ncm, sizeof(ncm)); ncm.cbSize = NCM_SIZE_95;
    if (SystemParametersInfoA(SPI_GETNONCLIENTMETRICS, NCM_SIZE_95, &ncm, 0)) {
        put("iBorderWidth=%d\r\niScrollWidth=%d\r\niScrollHeight=%d\r\niCaptionWidth=%d\r\niCaptionHeight=%d\r\niSmCaptionWidth=%d\r\niSmCaptionHeight=%d\r\niMenuWidth=%d\r\niMenuHeight=%d\r\n",
            ncm.iBorderWidth, ncm.iScrollWidth, ncm.iScrollHeight, ncm.iCaptionWidth, ncm.iCaptionHeight, ncm.iSmCaptionWidth, ncm.iSmCaptionHeight, ncm.iMenuWidth, ncm.iMenuHeight);
        putLogFont("lfCaptionFont", &ncm.lfCaptionFont); putLogFont("lfSmCaptionFont", &ncm.lfSmCaptionFont); putLogFont("lfMenuFont", &ncm.lfMenuFont);
        putLogFont("lfStatusFont", &ncm.lfStatusFont); putLogFont("lfMessageFont", &ncm.lfMessageFont);
    } else put("error=SPI_GETNONCLIENTMETRICS failed (%d)\r\n", (int)GetLastError());

    put("\r\n[fonts]\r\n; the font each name selects: face, then TEXTMETRIC height = ascent + descent, leadings, average and maximum width\r\n");
    for (i = 0; i < FONT_COUNT; i++) {
        TEXTMETRICA tm; char face[LF_FACESIZE]; HFONT old = SelectObject(dc, fonts[i]); SIZE size;
        GetTextMetricsA(dc, &tm); GetTextFaceA(dc, sizeof(face), face); GetTextExtentPoint32A(dc, "Sample Text 0123", 16, &size);
        put("%s=face \"%s\" height %d ascent %d descent %d internal %d external %d avgwidth %d maxwidth %d weight %d sample %d x %d\r\n", fontNames[i], face,
            (int)tm.tmHeight, (int)tm.tmAscent, (int)tm.tmDescent, (int)tm.tmInternalLeading, (int)tm.tmExternalLeading, (int)tm.tmAveCharWidth, (int)tm.tmMaxCharWidth, (int)tm.tmWeight, (int)size.cx, (int)size.cy);
        SelectObject(dc, old);
    }
    ReleaseDC(NULL, dc);
    putDialogUnits();
}

static void putRect(const char *key, const RECT *rc) { put("%s=%d,%d,%d,%d\r\n", key, (int)rc->left, (int)rc->top, (int)(rc->right - rc->left), (int)(rc->bottom - rc->top)); }

/* Per-sheet section: where each control really is (x,y,w,h in grid pixels) and the sizes only the control knows. */
static void buildSheetPart(void)
{
    int i, n; RECT rc; char key[96];
    target(sheetPart[sheet - 1], sizeof(sheetPart[0]));
    put("\r\n[sheet%d]\r\n; id=x,y,w,h of the window made for the cell, measured with GetWindowRect\r\n", sheet);
    for (i = 0; i < NCELLS; i++) {
        const CELL *c = &cells[i]; HWND h = cellWnd[i];
        if (c->sheet != sheet || !h) continue;
        GetWindowRect(h, &rc); putRect(c->id, &rc);
        if (c->kind == K_WINDOW) { POINT p = { 0, 0 }; RECT client; GetClientRect(h, &client); ClientToScreen(h, &p); OffsetRect(&client, p.x, p.y); wsprintfA(key, "%s.client", c->id); putRect(key, &client); }
        if (cellAux[i]) { GetWindowRect(cellAux[i], &rc); wsprintfA(key, "%s.updown", c->id); putRect(key, &rc); }
        if (c->kind == K_LISTBOX) put("%s.itemheight=%d\r\n", c->id, (int)SendMessageA(h, LB_GETITEMHEIGHT, 0, 0));
        if (c->kind == K_COMBO) put("%s.fieldheight=%d\r\n%s.itemheight=%d\r\n", c->id, (int)SendMessageA(h, CB_GETITEMHEIGHT, (WPARAM)-1, 0), c->id, (int)SendMessageA(h, CB_GETITEMHEIGHT, 0, 0));
        if (c->kind == K_STATUS) { int b[3] = { 0, 0, 0 }; SendMessageA(h, SB_GETBORDERS, 0, (LPARAM)b); put("%s.borders=%d,%d,%d\r\n", c->id, b[0], b[1], b[2]);
            for (n = 0; n < 2; n++) if (SendMessageA(h, SB_GETRECT, n, (LPARAM)&rc)) { MapWindowPoints(h, NULL, (POINT *)&rc, 2); wsprintfA(key, "%s.part%d", c->id, n); putRect(key, &rc); } }
        if (c->kind == K_TAB) { for (n = 0; n < 3; n++) if (SendMessageA(h, TCM_GETITEMRECT, n, (LPARAM)&rc)) { MapWindowPoints(h, NULL, (POINT *)&rc, 2); wsprintfA(key, "%s.item%d", c->id, n); putRect(key, &rc); }
            GetClientRect(h, &rc); SendMessageA(h, TCM_ADJUSTRECT, FALSE, (LPARAM)&rc); MapWindowPoints(h, NULL, (POINT *)&rc, 2); wsprintfA(key, "%s.display", c->id); putRect(key, &rc); }
        if (c->kind == K_TRACKBAR) { SendMessageA(h, TBM_GETTHUMBRECT, 0, (LPARAM)&rc); MapWindowPoints(h, NULL, (POINT *)&rc, 2); wsprintfA(key, "%s.thumb", c->id); putRect(key, &rc);
            SendMessageA(h, TBM_GETCHANNELRECT, 0, (LPARAM)&rc); MapWindowPoints(h, NULL, (POINT *)&rc, 2); wsprintfA(key, "%s.channel", c->id); putRect(key, &rc); }
    }
    if (menuOpen && hPopup) {
        HWND menuWnd = FindWindowA("#32768", NULL);
        if (menuWnd) { GetWindowRect(menuWnd, &rc); putRect("menu", &rc); } else put("menu=window not found\r\n");
        n = GetMenuItemCount(hPopup);
        if (n > 0 && n <= 16) {
            RECT item[16]; int total = 0, dx = 0, dy = 0; BOOL ok = TRUE;
            for (i = 0; i < n; i++) { ok = ok && (GetMenuItemRect(hMenuOwner, hPopup, i, &item[i]) || GetMenuItemRect(NULL, hPopup, i, &item[i])); total += item[i].bottom - item[i].top; }
            /* Windows 95 reports a pop-up's item rectangles from the owner's client corner, not on the screen. When the
               first item is not inside the menu window, move them all so the block of items is centred in the window. */
            if (ok && menuWnd && (item[0].left < rc.left || item[0].top < rc.top || item[0].right > rc.right || item[n - 1].bottom > rc.bottom)) {
                dx = rc.left + ((rc.right - rc.left) - (item[0].right - item[0].left)) / 2 - item[0].left;
                dy = rc.top + ((rc.bottom - rc.top) - total) / 2 - item[0].top;
                put("menu.items=moved by %d,%d: GetMenuItemRect answered relative to the owner window\r\n", dx, dy);
            }
            if (ok) for (i = 0; i < n; i++) { OffsetRect(&item[i], dx, dy); wsprintfA(key, "menu.item%d", i); putRect(key, &item[i]); }
        }
        if (hMenuOwner && GetMenu(hMenuOwner)) for (i = 0; i < GetMenuItemCount(GetMenu(hMenuOwner)); i++) if (GetMenuItemRect(hMenuOwner, GetMenu(hMenuOwner), i, &rc)) { wsprintfA(key, "menubar.item%d", i); putRect(key, &rc); }
    } else if (sheet == 3) { put("menu=not open when measured\r\n"); failed = 1; }
}

/* ---- display mode ---------------------------------------------------------------------------------------- */

/* Returns TRUE if Windows is restarting to apply the requested mode. */
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
    if (attempted) { wsprintfA(modeNote, "requested %d x %d, %d bits; still %d x %d, %d bits after a restart", width, height, bits, nowW, nowH, nowBits); failed = 1; return FALSE; }
    for (i = 0; ; i++) {
        ZeroMemory(&dm, sizeof(dm)); dm.dmSize = sizeof(dm);
        if (!EnumDisplaySettingsA(NULL, i, &dm)) break;
        if ((int)dm.dmBitsPerPel == bits && (int)dm.dmPelsWidth == width && (int)dm.dmPelsHeight == height) { found = TRUE; break; }
    }
    if (!found) { wsprintfA(modeNote, "requested %d x %d, %d bits: the display driver does not list that mode (%d modes listed)", width, height, bits, i); failed = 1; return FALSE; }
    dm.dmFields = DM_BITSPERPEL | DM_PELSWIDTH | DM_PELSHEIGHT;
    result = ChangeDisplaySettingsA(&dm, CDS_UPDATEREGISTRY);
    if (result == DISP_CHANGE_SUCCESSFUL) { wsprintfA(modeNote, "requested %d x %d, %d bits: changed without a restart", width, height, bits); return FALSE; }
    if (result == DISP_CHANGE_RESTART) { WritePrivateProfileStringA("state", "attempted", "1", iniPath); WritePrivateProfileStringA(NULL, NULL, NULL, iniPath); ExitWindowsEx(EWX_REBOOT, 0); return TRUE; }
    wsprintfA(modeNote, "requested %d x %d, %d bits: ChangeDisplaySettings failed (%d)", width, height, bits, (int)result); failed = 1;
    return FALSE;
}

/* ---- drawing --------------------------------------------------------------------------------------------- */

static void fill(HDC dc, int x, int y, int w, int h, COLORREF c)
{
    RECT rc; HBRUSH b = CreateSolidBrush(c);
    SetRect(&rc, x, y, x + w, y + h); FillRect(dc, &rc, b); DeleteObject(b);
}

static void drawMarker(HDC dc)
{
    int i;
    fill(dc, 0, 0, 8, 8, failed ? RGB(255, 255, 0) : RGB(255, 0, 0));
    for (i = 0; i < 3; i++) fill(dc, 8 + i * 8, 0, 8, 8, sheet & (4 >> i) ? RGB(255, 255, 255) : RGB(0, 0, 0));
    fill(dc, 32, 0, 8, 8, RGB(0, 0, 255));
}

static void paintGrid(HDC dc)
{
    int i; RECT rc;
    for (i = 0; i < NCELLS; i++) {
        const CELL *c = &cells[i];
        if (c->sheet != sheet) continue;
        SetRect(&rc, c->x, c->y, c->x + c->w, c->y + c->h);
        switch (c->kind) {
        case K_EDGE: DrawEdge(dc, &rc, c->a, c->b | BF_RECT); break;
        case K_DFC: DrawFrameControl(dc, &rc, c->a, c->b); break;
        case K_SWATCH: FillRect(dc, &rc, GetSysColorBrush(c->a)); break;
        case K_FOCUSRECT: SetTextColor(dc, RGB(0, 0, 0)); SetBkColor(dc, RGB(255, 255, 255)); DrawFocusRect(dc, &rc); break;
        case K_TEXT: {
            HFONT old = SelectObject(dc, fonts[c->a]);
            SetBkMode(dc, TRANSPARENT); SetTextColor(dc, GetSysColor(COLOR_BTNTEXT));
            if (c->state & ST_DISABLED) DrawStateA(dc, NULL, NULL, (LPARAM)c->text, lstrlenA(c->text), c->x, c->y, c->w, c->h, DST_TEXT | DSS_DISABLED);
            else TextOutA(dc, c->x, c->y, c->text, lstrlenA(c->text));
            SelectObject(dc, old);
            break; }
        }
    }
    if (ready) drawMarker(dc);
}

/* ---- controls -------------------------------------------------------------------------------------------- */

static HWND child(const char *cls, const char *text, DWORD style, DWORD ex, int x, int y, int w, int h)
{
    HWND hwnd = CreateWindowExA(ex, cls, text, WS_CHILD | WS_VISIBLE | style, x, y, w, h, hGrid, NULL, hInst, NULL);
    if (!hwnd) failed = 1;
    return hwnd;
}

static void buildControl(int i)
{
    const CELL *c = &cells[i]; HWND h = NULL; int n; BOOL font = TRUE;
    static const char *const items[] = { "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel" };
    switch (c->kind) {
    case K_BUTTON: h = child("BUTTON", c->text, c->a, 0, c->x, c->y, c->w, c->h); break;
    case K_EDIT: h = child("EDIT", c->text, c->a, WS_EX_CLIENTEDGE, c->x, c->y, c->w, c->h); break;
    case K_STATIC: h = child("STATIC", c->text, c->a, 0, c->x, c->y, c->w, c->h); break;
    case K_LISTBOX:
        h = child("LISTBOX", "", c->a | LBS_NOINTEGRALHEIGHT | LBS_NOTIFY, WS_EX_CLIENTEDGE, c->x, c->y, c->w, c->h);
        for (n = 0; n < (c->state & ST_MANY ? 8 : 3); n++) SendMessageA(h, LB_ADDSTRING, 0, (LPARAM)items[n]);
        if (c->state & ST_SELECT) SendMessageA(h, LB_SETCURSEL, 1, 0);
        break;
    case K_COMBO:
        h = child("COMBOBOX", "", c->a | WS_VSCROLL, 0, c->x, c->y, c->w, c->h + 100);   /* the height includes the drop-down list */
        if (h) SendMessageA(h, WM_SETFONT, (WPARAM)fonts[FONT_GUI], TRUE);
        for (n = 0; n < 3; n++) SendMessageA(h, CB_ADDSTRING, 0, (LPARAM)items[n]);
        if (c->state & ST_SELECT) SendMessageA(h, CB_SETCURSEL, 0, 0);
        break;
    case K_SCROLLBAR: {
        SCROLLINFO si; si.cbSize = sizeof(si); si.fMask = SIF_RANGE | SIF_PAGE | SIF_POS; si.nMin = 0;
        si.nMax = c->state & ST_MINTHUMB ? 10000 : 100; si.nPage = c->state & ST_MINTHUMB ? 1 : c->state & ST_PAGE ? 40 : 0; si.nPos = c->state & ST_MINTHUMB ? c->b * 100 : c->b;
        h = child("SCROLLBAR", "", c->a, 0, c->x, c->y, c->w, c->h);
        SetScrollInfo(h, SB_CTL, &si, TRUE);
        break; }
    case K_STATUS: {
        int parts[2]; parts[0] = c->w - 90; parts[1] = -1; font = FALSE;   /* a status bar keeps the font it chooses itself */
        h = child(STATUSCLASSNAMEA, "", c->a | CCS_NOPARENTALIGN | CCS_NORESIZE | CCS_NODIVIDER, 0, c->x, c->y, c->w, c->h);
        SendMessageA(h, SB_SETPARTS, 2, (LPARAM)parts); SendMessageA(h, SB_SETTEXTA, 0, (LPARAM)c->text); SendMessageA(h, SB_SETTEXTA, 1, (LPARAM)"Ln 1, Col 1");
        break; }
    case K_PROGRESS: h = child(PROGRESS_CLASSA, "", c->a, 0, c->x, c->y, c->w, c->h); SendMessageA(h, PBM_SETRANGE, 0, MAKELPARAM(0, 100)); SendMessageA(h, PBM_SETPOS, c->b, 0); break;
    case K_TRACKBAR: h = child(TRACKBAR_CLASSA, "", c->a, 0, c->x, c->y, c->w, c->h); SendMessageA(h, TBM_SETRANGE, TRUE, MAKELPARAM(0, 10)); SendMessageA(h, TBM_SETPOS, TRUE, c->b); break;
    case K_UPDOWN:
        if (c->state & ST_BUDDY) {
            h = child("EDIT", "", ES_AUTOHSCROLL, WS_EX_CLIENTEDGE, c->x, c->y, c->w, c->h);
            if (h) SendMessageA(h, WM_SETFONT, (WPARAM)fonts[FONT_GUI], TRUE);
            cellAux[i] = CreateUpDownControl(WS_CHILD | WS_VISIBLE | c->a, 0, 0, 0, 0, hGrid, 0, hInst, h, 100, 0, c->b);
            if (!cellAux[i]) failed = 1;
            if (c->state & ST_DISABLED) EnableWindow(cellAux[i], FALSE);
        } else { h = child(UPDOWN_CLASSA, "", c->a, 0, c->x, c->y, c->w, c->h); SendMessageA(h, UDM_SETRANGE, 0, MAKELPARAM(100, 0)); SendMessageA(h, UDM_SETPOS, 0, MAKELPARAM(50, 0)); }
        break;
    case K_TAB: {
        static const char *const tabs[] = { "General", "View", "Colors" }; TC_ITEMA item;
        h = child(WC_TABCONTROLA, "", c->a, 0, c->x, c->y, c->w, c->h);
        if (h) SendMessageA(h, WM_SETFONT, (WPARAM)fonts[FONT_GUI], TRUE);
        for (n = 0; n < 3; n++) { ZeroMemory(&item, sizeof(item)); item.mask = TCIF_TEXT; item.pszText = (char *)tabs[n]; SendMessageA(h, TCM_INSERTITEMA, n, (LPARAM)&item); }
        SendMessageA(h, TCM_SETCURSEL, 0, 0);
        break; }
    case K_HEADER: {
        static const char *const heads[] = { "Name", "Size", "Type" }; HDITEMA item;
        h = child(WC_HEADERA, "", c->a | HDS_HORZ, 0, c->x, c->y, c->w, c->h);
        if (h) SendMessageA(h, WM_SETFONT, (WPARAM)fonts[FONT_GUI], TRUE);
        for (n = 0; n < 3; n++) { ZeroMemory(&item, sizeof(item)); item.mask = HDI_TEXT | HDI_WIDTH | HDI_FORMAT; item.fmt = HDF_STRING | HDF_LEFT; item.cxy = 70; item.pszText = (char *)heads[n]; SendMessageA(h, HDM_INSERTITEMA, n, (LPARAM)&item); }
        break; }
    default: return;
    }
    cellWnd[i] = h;
    if (!h) return;
    if (font) SendMessageA(h, WM_SETFONT, (WPARAM)fonts[FONT_GUI], TRUE);
    if (c->state & ST_CHECKED) SendMessageA(h, BM_SETCHECK, 1, 0);
    if (c->state & ST_MIXED) SendMessageA(h, BM_SETCHECK, 2, 0);
    if (c->state & ST_PUSHED) SendMessageA(h, BM_SETSTATE, TRUE, 0);
    /* The control draws its focused state when told it has the focus; the real focus stays with the grid window. */
    if (c->state & ST_FOCUS) SendMessageA(h, WM_SETFOCUS, 0, 0);
    if (c->state & ST_DISABLED) EnableWindow(h, FALSE);
}

static LRESULT CALLBACK frameProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
    case WM_ERASEBKGND: { RECT rc; GetClientRect(hwnd, &rc); FillRect((HDC)wp, &rc, GetSysColorBrush(GetWindowLongA(hwnd, GWL_USERDATA) & ST_WHITE ? COLOR_WINDOW : COLOR_BTNFACE)); return 1; }
    case WM_KEYDOWN: PostMessageA(hGrid, WM_APP_CMD, wp, 0); return 0;
    case WM_CLOSE: return 0;
    case WM_SETCURSOR: SetCursor(NULL); return TRUE;
    }
    return DefWindowProcA(hwnd, msg, wp, lp);
}

static void buildWindow(int i)
{
    const CELL *c = &cells[i]; HMENU bar = NULL; HWND h;
    if (c->state & ST_MENUBAR) {
        HMENU file = CreatePopupMenu(), edit = CreatePopupMenu(), help = CreatePopupMenu();
        AppendMenuA(file, MF_STRING, 1, "E&xit"); AppendMenuA(edit, MF_STRING, 2, "&Copy"); AppendMenuA(help, MF_STRING, 3, "&About");
        bar = CreateMenu();
        AppendMenuA(bar, MF_POPUP, (UINT)file, "&File"); AppendMenuA(bar, MF_POPUP, (UINT)edit, "&Edit");
        AppendMenuA(bar, MF_STRING | MF_GRAYED, 4, "&View"); AppendMenuA(bar, MF_POPUP, (UINT)help, "&Help");
    }
    h = CreateWindowExA(c->b, "refgrid.frame", c->text, c->a, c->x, c->y, c->w, c->h, hGrid, bar, hInst, NULL);
    if (!h) { failed = 1; return; }
    SetWindowLongA(h, GWL_USERDATA, c->state);
    cellWnd[i] = h;
    if (c->a & (WS_HSCROLL | WS_VSCROLL)) { SetScrollRange(h, SB_HORZ, 0, 100, FALSE); SetScrollRange(h, SB_VERT, 0, 100, FALSE); }
    ShowWindow(h, SW_SHOWNOACTIVATE);
    if ((c->state & ST_MENUBAR) && !hMenuOwner) hMenuOwner = h;
}

static void buildPopup(void)
{
    hSub = CreatePopupMenu(); AppendMenuA(hSub, MF_STRING, 201, "&Desktop");
    hPopup = CreatePopupMenu();
    AppendMenuA(hPopup, MF_STRING, 101, "&New\tCtrl+N");
    AppendMenuA(hPopup, MF_STRING | MF_CHECKED, 102, "&Status Bar");            /* highlighted: two Down keys */
    AppendMenuA(hPopup, MF_STRING | MF_GRAYED, 103, "&Paste\tCtrl+V");
    AppendMenuA(hPopup, MF_STRING | MF_CHECKED, 104, "&Toolbar");
    AppendMenuA(hPopup, MF_STRING, 105, "&Large Icons"); CheckMenuRadioItem(hPopup, 105, 105, 105, MF_BYCOMMAND);
    AppendMenuA(hPopup, MF_STRING | MF_CHECKED | MF_GRAYED, 106, "&Word Wrap");
    AppendMenuA(hPopup, MF_SEPARATOR, 0, NULL);
    AppendMenuA(hPopup, MF_POPUP, (UINT)hSub, "Sen&d To");
    AppendMenuA(hPopup, MF_STRING, 108, "E&xit\tAlt+F4");
}

static void destroySheet(void)
{
    int i;
    KillTimer(hGrid, TIMER_READY); ready = 0;
    for (i = 0; i < NCELLS; i++) {
        if (cellAux[i]) DestroyWindow(cellAux[i]);
        if (cellWnd[i]) DestroyWindow(cellWnd[i]);   /* destroying a window destroys its menu bar */
        cellAux[i] = cellWnd[i] = NULL;
    }
    if (hPopup) DestroyMenu(hPopup);                 /* takes the submenu with it */
    hPopup = hSub = NULL; hMenuOwner = NULL;
}

static void buildSheet(void)
{
    int i, menuCell = -1;
    for (i = 0; i < NCELLS; i++) {
        if (cells[i].sheet != sheet) continue;
        if (cells[i].kind == K_WINDOW) buildWindow(i);
        else if (cells[i].kind == K_MENU) menuCell = i;
        else buildControl(i);
    }
    SetForegroundWindow(hGrid); SetActiveWindow(hGrid); SetFocus(hGrid);
    if (menuCell >= 0 && hMenuOwner) {
        SetActiveWindow(hMenuOwner);
        buildPopup();
        PostMessageA(hGrid, WM_APP_MENU, menuCell, 0);
    }
    /* Draw the other "active" captions after the real activation has settled. */
    for (i = 0; i < NCELLS; i++) if (cellWnd[i] && cells[i].kind == K_WINDOW && (cells[i].state & ST_ACTIVE)) SendMessageA(cellWnd[i], WM_NCACTIVATE, TRUE, 0);
    InvalidateRect(hGrid, NULL, TRUE);
    SetTimer(hGrid, TIMER_READY, READY_DELAY_MS, NULL);
}

static void command(WPARAM key)
{
    if (menuOpen) {   /* leave the menu's message loop first, then run the command */
        if (hMenuOwner) SendMessageA(hMenuOwner, WM_CANCELMODE, 0, 0);
        PostMessageA(hGrid, WM_APP_CMD, key, 0);
        return;
    }
    if (key >= '1' && key < '1' + SHEETS) {
        destroySheet(); sheet = (int)(key - '0');
        /* Repaint the whole grid while it has no children: controls that do not paint their own background
           (an etched frame, a group box) would otherwise show the previous sheet through. */
        RedrawWindow(hGrid, NULL, NULL, RDW_INVALIDATE | RDW_ERASE | RDW_UPDATENOW);
        buildSheet();
    }
    else if (key == 'X') DestroyWindow(hGrid);
    else if (key == 'Q') { destroySheet(); ExitWindowsEx(EWX_SHUTDOWN, 0); }
}

static LRESULT CALLBACK gridProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp)
{
    switch (msg) {
    case WM_PAINT: { PAINTSTRUCT ps; HDC dc = BeginPaint(hwnd, &ps); paintGrid(dc); EndPaint(hwnd, &ps); return 0; }
    case WM_TIMER:
        if (wp == TIMER_READY) {
            HDC dc;
            KillTimer(hwnd, TIMER_READY);
            /* Something else that starts with Windows (the Welcome window) may have taken the keyboard since. */
            if (!menuOpen) { SetForegroundWindow(hwnd); SetFocus(hwnd); }
            buildSheetPart(); writeReport();
            ready = 1; dc = GetDC(hwnd); drawMarker(dc); ReleaseDC(hwnd, dc);
        }
        return 0;
    case WM_APP_MENU: {
        const CELL *c = &cells[wp]; HWND owner = hMenuOwner;
        if (!owner || !hPopup) return 0;
        PostMessageA(owner, WM_KEYDOWN, VK_DOWN, 0); PostMessageA(owner, WM_KEYDOWN, VK_DOWN, 0);
        menuOpen = 1;
        TrackPopupMenu(hPopup, TPM_LEFTALIGN | TPM_TOPALIGN | TPM_LEFTBUTTON, c->x, c->y, 0, owner, NULL);
        menuOpen = 0;
        return 0; }
    case WM_APP_CMD: command(wp); return 0;
    case WM_KEYDOWN: command(wp); return 0;
    case WM_SETCURSOR: SetCursor(NULL); return TRUE;
    case WM_CLOSE: return 0;
    case WM_QUERYENDSESSION: return TRUE;
    case WM_DESTROY: destroySheet(); PostQuitMessage(0); return 0;
    }
    return DefWindowProcA(hwnd, msg, wp, lp);
}

int WINAPI WinMain(HINSTANCE instance, HINSTANCE previous, LPSTR commandLine, int show)
{
    WNDCLASSA wc; MSG msg; NONCLIENTMETRICSA ncm; char *slash; int i;
    hInst = instance;
    GetModuleFileNameA(NULL, dir, sizeof(dir));
    for (slash = dir + lstrlenA(dir); slash > dir && slash[-1] != '\\'; slash--) ;
    *slash = 0;
    wsprintfA(iniPath, "%sREFGRID.INI", dir); wsprintfA(txtPath, "%sREFGRID.TXT", dir);
    if (applyDisplayMode()) return 0;

    InitCommonControls();
    for (i = 0; i < FONT_COUNT; i++) fonts[i] = GetStockObject(DEFAULT_GUI_FONT);
    fonts[FONT_SYSTEM] = GetStockObject(SYSTEM_FONT);
    ZeroMemory(&ncm, sizeof(ncm)); ncm.cbSize = NCM_SIZE_95;
    if (SystemParametersInfoA(SPI_GETNONCLIENTMETRICS, NCM_SIZE_95, &ncm, 0)) {
        fonts[FONT_CAPTION] = CreateFontIndirectA(&ncm.lfCaptionFont); fonts[FONT_SMCAPTION] = CreateFontIndirectA(&ncm.lfSmCaptionFont);
        fonts[FONT_MENU] = CreateFontIndirectA(&ncm.lfMenuFont); fonts[FONT_STATUS] = CreateFontIndirectA(&ncm.lfStatusFont);
        fonts[FONT_MESSAGE] = CreateFontIndirectA(&ncm.lfMessageFont);
    } else failed = 1;

    ZeroMemory(&wc, sizeof(wc));
    wc.hInstance = instance; wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);
    wc.lpfnWndProc = gridProc; wc.lpszClassName = "refgrid.grid"; RegisterClassA(&wc);
    wc.hbrBackground = NULL; wc.hIcon = LoadIconA(NULL, IDI_APPLICATION);
    wc.lpfnWndProc = frameProc; wc.lpszClassName = "refgrid.frame"; RegisterClassA(&wc);

    hGrid = CreateWindowExA(WS_EX_TOPMOST, "refgrid.grid", "refgrid", WS_POPUP | WS_CLIPCHILDREN, 0, 0, GRID_W, GRID_H, NULL, NULL, instance, NULL);
    if (!hGrid) return 1;
    /* Park the pointer in the far corner and hide it, so it is in no cell. */
    SetCursorPos(GetSystemMetrics(SM_CXSCREEN) - 1, GetSystemMetrics(SM_CYSCREEN) - 1); ShowCursor(FALSE);
    ShowWindow(hGrid, SW_SHOW); UpdateWindow(hGrid);
    buildFixedPart();
    i = GetPrivateProfileIntA("refgrid", "sheet", 1, iniPath);
    if (i >= 1 && i <= SHEETS) sheet = i;
    buildSheet();
    while (GetMessageA(&msg, NULL, 0, 0) > 0) { TranslateMessage(&msg); DispatchMessageA(&msg); }
    return 0;
}
