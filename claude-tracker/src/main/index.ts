import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { initDb } from './db'
import { createStore, registerIpcHandlers } from './ipc-handlers'
import { startScheduler } from './scheduler'

const store = createStore()
const dbPath = path.join(app.getPath('userData'), 'tracker.db')
const db = initDb(dbPath)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  const savedBounds = store.get('windowBounds' as any, null) as { x: number; y: number; width: number; height: number } | null

  mainWindow = new BrowserWindow({
    width:    savedBounds?.width  ?? 380,
    height:   savedBounds?.height ?? 520,
    minWidth:  300,
    minHeight: 400,
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    frame: false,
    transparent: true,
    alwaysOnTop: store.get('alwaysOnTop', true),
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  const saveBounds = () => {
    const b = mainWindow?.getBounds()
    if (b) store.set('windowBounds' as any, b)
  }
  mainWindow.on('moved', saveBounds)
  mainWindow.on('resized', saveBounds)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function buildTrayMenu(): Menu {
  const onTop = store.get('alwaysOnTop', true)
  return Menu.buildFromTemplate([
    { label: 'Claude Tracker', enabled: false },
    { type: 'separator' },
    { label: 'Actualiser', click: () => mainWindow?.webContents.send('tray-refresh') },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: onTop,
      click: () => {
        const next = !onTop
        store.set('alwaysOnTop', next)
        mainWindow?.setAlwaysOnTop(next)
        tray?.setContextMenu(buildTrayMenu())
      },
    },
    { type: 'separator' },
    { label: 'Paramètres', click: () => mainWindow?.webContents.send('tray-open-settings') },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() },
  ])
}

function createTray(): void {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, '../../resources/icon.png'))
    .resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Claude Tracker')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide()
    else mainWindow?.show()
  })
}

app.whenReady().then(() => {
  registerIpcHandlers(db, store)
  createWindow()
  createTray()
  startScheduler(db, store)
})

// Keep app alive via tray even when window is closed
app.on('window-all-closed', () => { /* intentionally empty — tray keeps app alive */ })
