// 매일 GitHub Actions에서 실행: YieldMax ULTY 페이지에서
// "Intra-Day Trades Download" / "Download Holdings" 두 파일을 내려받아
// 파일 안의 Date 값을 읽어 "yy-mm-dd" 형식으로 이름을 바꾼 뒤 구글 드라이브에 업로드한다.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const { google } = require('googleapis');

const ULTY_PAGE_URL = 'https://www.yieldmaxetfs.com/our-etfs/ulty/';

const TARGETS = [
  { buttonText: 'Intra-Day Trades Download', prefix: 'ULTY_IntradayTrades', subfolder: 'ULTY_IntradayTrades Down' },
  { buttonText: 'Download Holdings', prefix: 'ULTY_Holdings', subfolder: 'ULTY_Holdings Down' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// yy-mm-dd
function formatDate(d) {
  const yy = pad2(d.getFullYear() % 100);
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yy}-${mm}-${dd}`;
}

// 엑셀 파일을 읽어 데이터 영역 첫 번째 행에서 날짜값을 찾는다.
// "Date"라는 헤더가 있는 열을 우선 찾고, 없으면 셀 자체가 Date 객체인 첫 값을 사용한다.
function extractDateFromWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  if (!rows.length) throw new Error(`빈 시트: ${filePath}`);

  const header = rows[0].map((h) => (typeof h === 'string' ? h.trim().toLowerCase() : h));
  let dateCol = header.findIndex((h) => h === 'date');
  if (dateCol === -1) dateCol = 0;

  for (let r = 1; r < rows.length; r++) {
    const cell = rows[r] ? rows[r][dateCol] : null;
    if (cell instanceof Date && !isNaN(cell)) return cell;
    if (typeof cell === 'string' && cell.trim()) {
      const parsed = new Date(cell);
      if (!isNaN(parsed)) return parsed;
    }
  }

  throw new Error(`날짜를 찾지 못함: ${filePath}`);
}

async function downloadOne(page, buttonText, downloadDir) {
  const locator = page.getByRole('button', { name: buttonText }).or(page.getByRole('link', { name: buttonText }));
  await locator.first().waitFor({ state: 'visible', timeout: 30000 });

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    locator.first().click(),
  ]);

  const suggested = download.suggestedFilename() || 'download.xlsx';
  const ext = path.extname(suggested) || '.xlsx';
  const tmpPath = path.join(downloadDir, `raw-${Date.now()}${ext}`);
  await download.saveAs(tmpPath);
  return { tmpPath, ext };
}

// 서비스 계정은 개인 구글 드라이브에 저장용량이 없어 업로드가 거부되므로(storageQuotaExceeded),
// 사용자 본인 계정 권한(OAuth 리프레시 토큰)으로 인증해 본인 드라이브 용량을 사용한다.
async function driveClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REFRESH_TOKEN 환경변수가 없습니다.');
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}

async function findOrCreateSubfolder(drive, parentFolderId, name) {
  const escaped = name.replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  });
  console.log(`하위 폴더 생성됨: ${name} (id=${created.data.id})`);
  return created.data.id;
}

async function upsertDriveFile(drive, folderId, fileName, filePath, mimeType) {
  const escaped = fileName.replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `'${folderId}' in parents and name = '${escaped}' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const media = { mimeType, body: fs.createReadStream(filePath) };

  if (list.data.files && list.data.files.length > 0) {
    const fileId = list.data.files[0].id;
    await drive.files.update({ fileId, media });
    console.log(`업데이트됨: ${fileName} (id=${fileId})`);
  } else {
    const created = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media,
      fields: 'id',
    });
    console.log(`새로 업로드됨: ${fileName} (id=${created.data.id})`);
  }
}

async function main() {
  const folderId = process.env.GDRIVE_FOLDER_ID;
  if (!folderId) throw new Error('GDRIVE_FOLDER_ID 환경변수가 없습니다.');

  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yieldmax-'));
  const drive = await driveClient();

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.goto(ULTY_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    for (const target of TARGETS) {
      const { tmpPath, ext } = await downloadOne(page, target.buttonText, downloadDir);
      const fileDate = extractDateFromWorkbook(tmpPath);
      const finalName = `${target.prefix}_${formatDate(fileDate)}${ext}`;

      const mimeType =
        ext === '.csv'
          ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const subfolderId = await findOrCreateSubfolder(drive, folderId, target.subfolder);
      await upsertDriveFile(drive, subfolderId, finalName, tmpPath, mimeType);
    }
  } finally {
    await browser.close();
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
