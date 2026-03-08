import { app, BrowserWindow, session, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

function setupDevCORS() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["https://localhost:*/*", "http://localhost:*/*"] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      headers["Access-Control-Allow-Origin"] = ["*"];
      callback({ responseHeaders: headers });
    },
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    const devUrl = process.env["DEV_SERVER_URL"] ?? "https://localhost:3003";
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  if (isDev) {
    // Accept self-signed certs (mkcert) only for localhost
    app.on("certificate-error", (event, _wc, url, _err, _cert, callback) => {
      if (new URL(url).hostname === "localhost") {
        event.preventDefault();
        callback(true);
      } else {
        callback(false);
      }
    });
    setupDevCORS();
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      BrowserWindow.getAllWindows()[0]?.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
