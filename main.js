const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0d0f',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Window Controls ────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// ─── Database IPC Handlers ──────────────────────────────────────────────────
const db = require('./database/db');

ipcMain.handle('db-get-transactions', (_, year, month) => {
  return db.getTransactions(year, month);
});

ipcMain.handle('db-add-transaction', (_, data) => {
  return db.addTransaction(data);
});

ipcMain.handle('db-update-transaction', (_, id, data) => {
  return db.updateTransaction(id, data);
});

ipcMain.handle('db-delete-transaction', (_, id) => {
  return db.deleteTransaction(id);
});

ipcMain.handle('db-get-summary', (_, year, month) => {
  return db.getSummary(year, month);
});

ipcMain.handle('db-get-monthly-data', (_, year) => {
  return db.getMonthlyData(year);
});

ipcMain.handle('db-get-budgets', (_, year, month) => {
  return db.getBudgets(year, month);
});

ipcMain.handle('db-set-budget', (_, data) => {
  return db.setBudget(data);
});

ipcMain.handle('db-get-cards', () => {
  return db.getCards();
});

ipcMain.handle('db-add-card', (_, data) => {
  return db.addCard(data);
});

ipcMain.handle('db-delete-card', (_, id) => {
  return db.deleteCard(id);
});

ipcMain.handle('db-export-csv', (_, year, month) => {
  const transactions = db.getTransactions(year, month);
  const monthNames = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const header = 'Tarih,Tür,Kategori,Açıklama,Tutar,Banka\n';
  const rows = transactions.map(t =>
    `${t.date},${t.type === 'income' ? 'Gelir' : t.type === 'card' ? 'Kart Borcu' : 'Gider'},${t.category || ''},${(t.description || '').replace(/,/g, ';')},${t.amount},${t.bank_name || ''}`
  ).join('\n');
  const csvContent = header + rows;
  const downloadsPath = app.getPath('downloads');
  const fileName = `FinTrack_${year}_${monthNames[month - 1]}.csv`;
  const filePath = path.join(downloadsPath, fileName);
  fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf8');
  shell.showItemInFolder(filePath);
  return { success: true, filePath };
});

ipcMain.handle('send-notification', (_, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.handle('db-get-recurring', () => {
  return db.getRecurring();
});

ipcMain.handle('db-add-recurring', (_, data) => {
  return db.addRecurring(data);
});

ipcMain.handle('db-delete-recurring', (_, id) => {
  return db.deleteRecurring(id);
});

ipcMain.handle('db-apply-recurring', (_, year, month) => {
  return db.applyRecurring(year, month);
});
