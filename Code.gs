// 定数設定
const FOLDER_NAME = "IDWR-Insight-Data";
const PARENT_FOLDER_ID = "1QNMtQgeHELipJJgU38HJ0gEPQFGZ-gfC"; 
const SPREADSHEET_NAME = "Infection_Data_Master";
const ADMIN_EMAIL = "admin@example.com";
const RETRY_TRIGGER_TAG = "RETRY_";
const INDEX_BASE_URL = "https://id-info.jihs.go.jp/surveillance/idwr/rapid/";
const CSV_BASE_URL = "https://id-info.jihs.go.jp/surveillance/idwr/jp/rapid/";

function doGet(e) {
  try {
    const sheetName = e.parameter.type || 'Teiten'; 
    const folder = getOrCreateFolder_(PARENT_FOLDER_ID, FOLDER_NAME);
    const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
    let targetSheet = ss.getSheetByName(sheetName);

    if (!targetSheet) {
      if (sheetName.toLowerCase() === 'teiten') targetSheet = ss.getSheetByName('Teiten');
      else if (sheetName.toLowerCase() === 'ari') targetSheet = ss.getSheetByName('ARI');
      else if (sheetName.toLowerCase() === 'tougai') targetSheet = ss.getSheetByName('Tougai');
      
      if (!targetSheet) {
        throw new Error(`シート「${sheetName}」が見つかりません。`);
      }
    }

    return createCsvOutput_(targetSheet);

  } catch (err) {
    return ContentService.createTextOutput(`Error: ${err.toString()}`)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function createCsvOutput_(sheet) {
  const data = sheet.getDataRange().getValues();
  const csvString = convertToCsv_(data);
  return ContentService.createTextOutput(csvString)
    .setMimeType(ContentService.MimeType.CSV);
}

function convertToCsv_(data) {
  return data.map(row => row.map(cell => {
    let cellStr = String(cell);
    if (cellStr.includes('"') || cellStr.includes(',') || cellStr.includes('\n')) {
      cellStr = '"' + cellStr.replace(/"/g, '""') + '"';
    }
    return cellStr;
  }).join(',')).join('\n');
}

function main() {
  try {
    updateData_();
  } catch (e) {
    Logger.log("main実行中にエラーが発生しました: " + e.toString());
    cleanUpRetryTriggers_();
  }
}

function updateData_() {
  try {
    Logger.log("データ更新処理を開始します。");

    const folder = getOrCreateFolder_(PARENT_FOLDER_ID, FOLDER_NAME);
    const ss = getOrCreateSpreadsheet_(folder, SPREADSHEET_NAME);
    
    const currentYear = new Date().getFullYear();
    const indexPageUrl = `${INDEX_BASE_URL}${currentYear}/index.html`;
    const latestWeeklyPageUrl = getLatestWeeklyPageUrl_(indexPageUrl);

    const match = latestWeeklyPageUrl.match(/\/(\d{4})\/week(\d{2})\.html$/);
    if (!match) throw new Error("最新の週のURLから年と週を抽出できませんでした。");
    const year = parseInt(match[1], 10); 
    const week = parseInt(match[2], 10); 
    const weekStr = String(week).padStart(2, '0');
    
    const weeklyPath = `${CSV_BASE_URL}${year}/${weekStr}/`;
    const urls = {
      Teiten: `${weeklyPath}${year}-${weekStr}-teiten.csv`,
      Tougai: `${weeklyPath}${year}-${weekStr}-teiten-tougai.csv`, // 当該データ（県別週次推移）
      ARI: `${weeklyPath}${year}-${weekStr}-ari.csv`
    };
    
    const csvData = fetchAllCsv_(urls);
    Logger.log("全CSVデータの取得に成功しました。");

    writeCsvToSheet_(ss, 'Teiten', csvData.Teiten);
    writeCsvToSheet_(ss, 'Tougai', csvData.Tougai);
    writeCsvToSheet_(ss, 'ARI', csvData.ARI);

    Logger.log("データ更新処理が正常に終了しました。");
    cleanUpRetryTriggers_();

    return { year, week };

  } catch (e) {
    const errorMessage = "データ更新処理中にエラーが発生しました: " + e.toString();
    Logger.log(errorMessage);
    throw e;
  }
}

function getOrCreateSpreadsheet_(folder, name) {
  const files = folder.getFilesByName(name);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  } else {
    const ss = SpreadsheetApp.create(name);
    const file = DriveApp.getFileById(ss.getId());
    file.moveTo(folder);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return ss;
  }
}

function writeCsvToSheet_(ss, sheetName, csvContent) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clear();
  const data = Utilities.parseCsv(csvContent);
  if (data && data.length > 0) {
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
}

function fetchAllCsv_(urls) {
  const requests = Object.values(urls).map(url => ({ url: url, muteHttpExceptions: true }));
  const responses = UrlFetchApp.fetchAll(requests);
  const csvData = {};
  
  responses.forEach((response, i) => {
    const key = Object.keys(urls)[i];
    if (response.getResponseCode() == 200) {
      csvData[key] = response.getBlob().getDataAsString('Shift_JIS');
    } else {
      throw new Error("CSV取得失敗: " + key);
    }
  });
  return csvData;
}

function getOrCreateFolder_(parentFolderId, targetFolderName) {
  try {
    const parentFolder = DriveApp.getFolderById(parentFolderId);
    const folders = parentFolder.getFoldersByName(targetFolderName);
    if (folders.hasNext()) return folders.next();
    return parentFolder.createFolder(targetFolderName);
  } catch (e) {
    throw new Error(`親フォルダ(ID: ${parentFolderId})にアクセスできません。`);
  }
}

function getLatestWeeklyPageUrl_(indexPageUrl) {
  const response = UrlFetchApp.fetch(indexPageUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error("Index fetch failed");
  const htmlContent = response.getContentText();
  const linkRegex = /IDWR速報データ \d{4}年第(\d{1,2})週/g;
  let match, latestWeek = -1, latestLinkFileName = null; 
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const weekNumber = parseInt(match[1], 10);
    if (weekNumber > latestWeek) {
      latestWeek = weekNumber;
      latestLinkFileName = `week${String(weekNumber).padStart(2, '0')}.html`;
    }
  }
  if (latestLinkFileName) return indexPageUrl.substring(0, indexPageUrl.lastIndexOf('/') + 1) + latestLinkFileName;
  throw new Error("Latest link not found");
}

function cleanUpRetryTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction().startsWith(RETRY_TRIGGER_TAG)) ScriptApp.deleteTrigger(t);
  });
}

function scheduleRetry_() {
  const now = new Date();
  ScriptApp.newTrigger('retryMain').timeBased().after(60 * 60 * 1000).create();
}

function retryMain() {
  try { main(); } finally { cleanUpRetryTriggers_(); }
}