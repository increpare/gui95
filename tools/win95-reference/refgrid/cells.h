/*
 * Shared by refgrid.c and ../refscene/refscene.c: the kinds, state flags and structures that cells.def is written in.
 * cells.def is the one table of coordinates for both programs. refgrid shows sheets 1 to 3; refscene shows the rest.
 */
#ifndef REFGRID_CELLS_H
#define REFGRID_CELLS_H

enum { K_EDGE, K_DFC, K_SWATCH, K_FOCUSRECT, K_TEXT, K_BUTTON, K_EDIT, K_LISTBOX, K_COMBO, K_STATIC, K_SCROLLBAR,
       K_STATUS, K_PROGRESS, K_TRACKBAR, K_UPDOWN, K_TAB, K_HEADER, K_WINDOW, K_MENU,
       /* refscene only */
       K_TOOLBAR, K_TREE, K_LISTVIEW, K_HOTKEY, K_SCROLLBOX, K_FRAME, K_MDI, K_DIALOG, K_MSGBOX, K_PROPSHEET, K_COMDLG };

enum { FONT_GUI, FONT_CAPTION, FONT_SMCAPTION, FONT_MENU, FONT_STATUS, FONT_MESSAGE, FONT_SYSTEM, FONT_COUNT };   /* refgrid's text cells */

#define ST_DISABLED 0x0001
#define ST_PUSHED   0x0002
#define ST_CHECKED  0x0004
#define ST_MIXED    0x0008
#define ST_FOCUS    0x0010
#define ST_SELECT   0x0020
#define ST_ACTIVE   0x0040
#define ST_MENUBAR  0x0080
#define ST_WHITE    0x0100
#define ST_PAGE     0x0200
#define ST_MINTHUMB 0x0400
#define ST_MANY     0x0800
#define ST_BUDDY    0x1000
#define ST_ICONS    0x2000   /* refscene: a tree or list view with an image list */

typedef struct { int sheet; const char *id; int kind; int x, y, w, h; DWORD a, b; unsigned state; const char *text; } CELL;

/* refscene: dialog templates, in dialog units. DLG(name, w, h, style, caption); CTL(dialog, id, class, x, y, w, h, style, text). */
typedef struct { const char *name; int w, h; DWORD style; const char *caption; } DLGDEF;
typedef struct { const char *dlg; int id; const char *cls; int x, y, w, h; DWORD style; const char *text; } CTLDEF;

#endif
