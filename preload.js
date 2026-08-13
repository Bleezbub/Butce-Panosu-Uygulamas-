const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Transactions
  getTransactions:   (year, month) => ipcRenderer.invoke('db-get-transactions', year, month),
  addTransaction:    (data)        => ipcRenderer.invoke('db-add-transaction', data),
  updateTransaction: (id, data)    => ipcRenderer.invoke('db-update-transaction', id, data),
  deleteTransaction: (id)          => ipcRenderer.invoke('db-delete-transaction', id),
  getSummary:        (year, month) => ipcRenderer.invoke('db-get-summary', year, month),
  getMonthlyData:    (year)        => ipcRenderer.invoke('db-get-monthly-data', year),

  // Budgets
  getBudgets: (year, month) => ipcRenderer.invoke('db-get-budgets', year, month),
  setBudget:  (data)        => ipcRenderer.invoke('db-set-budget', data),

  // Cards
  getCards:   ()     => ipcRenderer.invoke('db-get-cards'),
  addCard:    (data) => ipcRenderer.invoke('db-add-card', data),
  deleteCard: (id)   => ipcRenderer.invoke('db-delete-card', id),

  // Recurring
  getRecurring:    ()            => ipcRenderer.invoke('db-get-recurring'),
  addRecurring:    (data)        => ipcRenderer.invoke('db-add-recurring', data),
  deleteRecurring: (id)          => ipcRenderer.invoke('db-delete-recurring', id),
  applyRecurring:  (year, month) => ipcRenderer.invoke('db-apply-recurring', year, month),

  // Utilities
  exportCSV:        (year, month)     => ipcRenderer.invoke('db-export-csv', year, month),
  sendNotification: (title, body)     => ipcRenderer.invoke('send-notification', { title, body }),
});
