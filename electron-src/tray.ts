import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import path from 'path'

let tray: Tray | null = null

export function createTray(mainWindow: BrowserWindow, port: number) {
  // Use a simple template icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADGSURBVDiNrZMxDgIhEEV/NhYewMrCxsLKxnvYeAIbb+JhPIGlhYfQwgNYW6yz7IJRk/lJQ2DmMzBDgD9RB0yBOXA0syNwAC7A3cye33hVT5IB0ADLaK8S2JNUOV8FZukvSQNJq8jjSaqAUyCJLoBJ5ZYkzUFEThPYAFtgZ2YPYLJ4cgS0gaQLLEkHM/uQ1AcGvWI9cNgAHTOrA5qwPIb38A8EZmYE0r98jgTJlL5D0otyV8EhYglsjKkBdhR7tWCwAp5M8zcbnckAAAAASUVORK5CYII='
  )

  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => mainWindow.show(),
    },
    {
      label: '立即采集',
      click: async () => {
        try {
          await fetch(`http://localhost:${port}/api/collect`, {
            method: 'POST',
          })
        } catch {}
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setToolTip('Predict Collector')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow.show()
  })
}
