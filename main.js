const API_URL = 'https://script.google.com/macros/s/AKfycbype0mQoW1TFTwHEkZY2GJ2G5niXoJwSgElUyR9xWMVtmfmxUarhhPhoTIsY3M4a2mKFw/exec';
let cachedData = null;
let currentDisease = 'Influenza';
let prefectureChart = null;

// CSVパーサー (簡易版)
function parseCSV(text) {
    const lines = text.split(/\r\n|\n/).map(line => line.trim()).filter(line => line);
    return lines.map(line => {
        const result = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuote && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuote = !inQuote;
                }
            } else if (char === ',' && !inQuote) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    });
}

async function fetchCSV(type) {
    try {
        const response = await fetch(`${API_URL}?type=${type}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
        return await response.text();
    } catch (e) {
        console.error(`Fetch error for type ${type}:`, e);
        throw e;
    }
}

async function init() {
    try {
        updateLoadingState(true);

        const [teitenCsv, ariCsv, tougaiCsv] = await Promise.all([
            fetchCSV('Teiten'),
            fetchCSV('ARI'),
            fetchCSV('Tougai')
        ]);

        const teitenData = parseCSV(teitenCsv);
        const ariData = parseCSV(ariCsv);
        const tougaiData = parseCSV(tougaiCsv);

        const processedData = processData(teitenData, ariData, tougaiData);
        cachedData = processedData;

        const dateMatch = teitenCsv.match(/(\d{4})年(\d{1,2})週/);
        if (dateMatch) {
            document.getElementById('update-date').textContent = `${dateMatch[1]}年 第${dateMatch[2]}週`;
        } else {
            document.getElementById('update-date').textContent = new Date().toLocaleDateString('ja-JP');
        }

        renderSummary(processedData);
        renderDashboard(currentDisease, processedData);
        updateLoadingState(false);

    } catch (error) {
        console.error('Error fetching data:', error);
        document.getElementById('summary-cards').innerHTML = '<p class="error">データの取得に失敗しました。詳細: ' + error.message + '</p>';
        updateLoadingState(false);
    }
}

function updateLoadingState(isLoading) {
    // const container = document.getElementById('summary-cards');
}

function processData(teitenRows, ariRows, tougaiRows) {
    const influenzaData = parseTeitenRows(teitenRows, 'Influenza');
    const covid19Data = parseTeitenRows(teitenRows, 'COVID-19');
    const ariDataParsed = parseAriRows(ariRows, 'ARI');

    const allData = [...influenzaData, ...covid19Data, ...ariDataParsed];

    // 履歴データのパース
    const historyData = parseTougaiRows(tougaiRows);

    const alerts = generateAlerts(allData);

    return {
        data: allData,
        history: historyData,
        summary: { alerts }
    };
}

function parseTeitenRows(rows, diseaseName) {
    if (!rows || rows.length < 5) return [];

    const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ];

    const diseaseHeaderRow = rows[2];
    const subHeaderRow = rows[3];

    let searchKeys = [diseaseName];
    if (diseaseName === 'Influenza') searchKeys.push('インフルエンザ');
    if (diseaseName === 'COVID-19') searchKeys.push('新型コロナウイルス感染症', 'COVID-19');

    let diseaseColumnIndex = -1;

    for (let i = 1; i < diseaseHeaderRow.length; i++) {
        const cellValue = diseaseHeaderRow[i] || '';
        if (searchKeys.some(key => cellValue.includes(key))) {
            for (let j = i; j < subHeaderRow.length; j++) {
                if ((subHeaderRow[j] || '').includes('定当')) {
                    diseaseColumnIndex = j;
                    break;
                }
            }
            break;
        }
    }

    if (diseaseColumnIndex === -1) {
        console.warn(`${diseaseName} column not found.`);
        return [];
    }

    const extractedData = [];
    for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= diseaseColumnIndex) continue;

        const prefName = (row[0] || '').trim();
        const value = parseFloat(row[diseaseColumnIndex]);
        const cleanValue = isNaN(value) ? 0 : value;

        if (prefectures.includes(prefName)) {
            extractedData.push({ disease: diseaseName, prefecture: prefName, value: cleanValue });
        } else if (prefName.replace(/\s+/g, '') === '総数') {
            extractedData.push({ disease: diseaseName, prefecture: '全国', value: cleanValue });
        }
    }
    return extractedData;
}

function parseAriRows(rows, diseaseName) {
    if (!rows || rows.length < 5) return [];

    const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
    ];

    const valueColumnIndex = 2;

    const extractedData = [];
    for (let i = 4; i < rows.length; i++) {
        const row = rows[i];
        const prefName = (row[0] || '').trim();
        const value = parseFloat(row[valueColumnIndex]);
        const cleanValue = isNaN(value) ? 0 : value;

        if (prefectures.includes(prefName)) {
            extractedData.push({ disease: diseaseName, prefecture: prefName, value: cleanValue });
        } else if (prefName.replace(/\s+/g, '') === '総数') {
            extractedData.push({ disease: diseaseName, prefecture: '全国', value: cleanValue });
        }
    }
    return extractedData;
}

function parseTougaiRows(rows) {
    if (!rows || rows.length < 10) return [];

    const historyData = [];

    // インフルエンザとCOVID-19の開始行を探す
    // 行の1列目に疾患名があるか、あるいはヘッダー行の上にあるか
    let influenzaStartRow = -1;
    let covidStartRow = -1;

    for (let i = 0; i < rows.length; i++) {
        // A列、B列、C列あたりをチェック
        const rowStr = rows[i].slice(0, 5).join(' '); // 最初の5列を結合して検索
        if (rowStr.includes('インフルエンザ')) influenzaStartRow = i;
        if (rowStr.includes('COVID-19') || rowStr.includes('新型コロナ')) covidStartRow = i;
    }

    console.log('Tougai Search Results:', { influenzaStartRow, covidStartRow });

    if (influenzaStartRow !== -1) {
        historyData.push(...extractHistoryFromSection(rows, influenzaStartRow, 'Influenza'));
    }
    if (covidStartRow !== -1) {
        historyData.push(...extractHistoryFromSection(rows, covidStartRow, 'COVID-19'));
    }

    return historyData;
}

function extractHistoryFromSection(rows, startRowIndex, diseaseName) {
    const results = [];
    // ヘッダー行は startRowIndex + 1 (週番号), + 2 (定当/報告) と仮定
    // データ行は + 3 から
    // 週番号ヘッダー行から、各週の「定当」列のインデックスを特定する
    const weekHeaderRow = rows[startRowIndex + 1];
    const typeHeaderRow = rows[startRowIndex + 2];

    const weekColumns = []; // { week: 1, colIndex: 5 }

    for (let i = 0; i < weekHeaderRow.length; i++) {
        const weekText = weekHeaderRow[i];
        const match = weekText.match(/(\d{1,2})週/);
        if (match) {
            // この週の「定当」列を探す（直下かその右）
            // weekHeaderRowのセル結合により、定当列は i ではなく i+1 かもしれない
            // typeHeaderRow を見て '定当' を探す
            if ((typeHeaderRow[i] || '').includes('定当')) {
                weekColumns.push({ week: parseInt(match[1]), colIndex: i });
            } else if ((typeHeaderRow[i + 1] || '').includes('定当')) {
                weekColumns.push({ week: parseInt(match[1]), colIndex: i + 1 });
            }
        }
    }

    // データ抽出
    // startRowIndex + 3 (総数) から、空行または次のセクションまで
    for (let i = startRowIndex + 3; i < rows.length; i++) {
        const row = rows[i];
        const prefName = (row[0] || '').trim();
        if (!prefName) break; // 空行なら終了
        if (prefName.includes('COVID-19') || prefName.includes('インフルエンザ')) break; // 次のセクション

        const history = weekColumns.map(wc => {
            const val = parseFloat(row[wc.colIndex]);
            return { week: wc.week, value: isNaN(val) ? 0 : val };
        });

        results.push({
            disease: diseaseName,
            prefecture: prefName.replace(/\s+/g, '') === '総数' ? '全国' : prefName,
            history: history
        });
    }
    return results;
}

function generateAlerts(data) {
    const comments = [];
    const diseases = ['Influenza', 'COVID-19', 'ARI'];

    diseases.forEach(disease => {
        const nationalData = data.find(item => item.disease === disease && item.prefecture === '全国');
        if (nationalData) {
            const value = nationalData.value;
            let level = 'normal';
            let message = '全国的に平常レベルです。';

            if (disease === 'Influenza') {
                if (value >= 10.0) { level = 'alert'; message = '全国的に警報レベルです。'; }
                else if (value >= 1.0) { level = 'warning'; message = '全国的に流行入りしています。'; }
            } else if (disease === 'COVID-19') {
                if (value >= 10.0) { level = 'alert'; message = '高い感染レベルです。'; }
                else if (value >= 5.0) { level = 'warning'; message = '注意が必要です。'; }
            } else if (disease === 'ARI') {
                if (value >= 120.0) { level = 'alert'; message = '流行レベルです。'; }
                else if (value >= 80.0) { level = 'warning'; message = '注意が必要です。'; }
            }

            comments.push({ disease, level, message });
        }
    });
    return comments;
}

function renderSummary(data) {
    const container = document.getElementById('summary-cards');
    container.innerHTML = '';

    const diseases = ['Influenza', 'COVID-19', 'ARI'];

    diseases.forEach(disease => {
        const nationalData = data.data.find(d => d.disease === disease && d.prefecture === '全国');
        const alert = data.summary.alerts.find(a => a.disease === disease);

        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => switchDisease(disease);
        card.style.cursor = 'pointer';

        card.innerHTML = `
            <h4>${getDiseaseName(disease)}</h4>
            <p class="value">${nationalData ? nationalData.value.toFixed(2) : '-'} <span class="unit">定点当たり</span></p>
            <p class="status ${alert ? alert.level : 'normal'}">${alert ? alert.message : 'データなし'}</p>
        `;
        container.appendChild(card);
    });
}

function switchDisease(disease) {
    currentDisease = disease;

    document.querySelectorAll('.nav-card').forEach(btn => {
        if (btn.dataset.disease === disease) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const titleElement = document.getElementById('current-disease-title');
    if (titleElement) {
        titleElement.textContent = `${getDiseaseName(disease)} 全国状況`;
    }

    // Reset view to map if needed, or keep current
    // 地図表示に戻す
    const mapView = document.getElementById('map-view');
    const prefChartContainer = document.getElementById('pref-chart-container');
    if (mapView && prefChartContainer) {
        mapView.classList.remove('hidden');
        prefChartContainer.classList.add('hidden');
    }

    if (cachedData) {
        renderDashboard(disease, cachedData);
    }
}

function getDiseaseName(key) {
    const names = {
        'Influenza': 'インフルエンザ',
        'COVID-19': 'COVID-19',
        'ARI': '急性呼吸器感染症'
    };
    return names[key] || key;
}

let currentChart = null;

function renderDashboard(disease, data) {
    const contentDiv = document.querySelector('.dashboard-content');

    // レイアウト初期化
    if (!document.getElementById('japan-map')) {
        contentDiv.innerHTML = `
            <div class="left-panel">
                <div id="map-view" class="view-container">
                    <div id="japan-map" class="map-container"></div>
                </div>
                <div id="pref-chart-container" class="view-container hidden" style="background:white; padding:20px; border-radius:12px; height:600px; position:relative;">
                    <button id="back-to-map-btn" style="position:absolute; top:10px; right:10px; z-index:10;">戻る</button>
                    <div style="height: 100%; width: 100%;">
                        <canvas id="prefectureHistoryChart"></canvas>
                    </div>
                </div>
            </div>
            <div class="right-panel">
                <div id="chart-view" class="chart-container-wrapper">
                    <canvas id="trendChart"></canvas>
                </div>
                <div class="detail-panel" id="detail-panel">
                    <div class="panel-header">
                        <h4 id="region-title">地域詳細</h4>
                        <button class="close-btn" onclick="closePanel()">×</button>
                    </div>
                    <div class="panel-content" id="region-content">
                        <p class="placeholder-text">地図上のエリアをクリックすると詳細が表示されます。</p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('back-to-map-btn').addEventListener('click', () => {
            document.getElementById('map-view').classList.remove('hidden');
            document.getElementById('pref-chart-container').classList.add('hidden');
        });
    }

    if (typeof renderJapanMap === 'function') {
        if (document.getElementById('japan-map')) {
            renderJapanMap('japan-map', data, disease);
        }
    }

    renderTrendChart(disease, data);
}

function renderTrendChart(disease, data) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    const diseaseData = data.data
        .filter(d => d.disease === disease && d.prefecture !== '全国')
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const labels = diseaseData.map(d => d.prefecture);
    const values = diseaseData.map(d => d.value);
    const backgroundColors = values.map(v => (typeof getColorForValue === 'function' ? getColorForValue(v, disease) : '#3498db'));

    currentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '定点当たり報告数',
                data: values,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: {
                    display: true,
                    text: `${getDiseaseName(disease)} 都道府県別 報告数 Top 10`,
                    font: { size: 14, family: "'Noto Sans JP', sans-serif" }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    title: { display: true, text: '定点当たり報告数' }
                },
                y: { ticks: { autoSkip: false } }
            }
        }
    });
}

function showPrefectureChart(prefecture, disease) {
    if (disease === 'ARI') return; // ARIはデータがないためスキップ

    // Reset chart container
    if (prefectureChart) {
        prefectureChart.destroy();
        prefectureChart = null;
    }

    const historyItem = cachedData.history.find(h => h.disease === disease && h.prefecture === prefecture);
    if (!historyItem) {
        console.warn(`No history data for ${prefecture} (${disease})`);
        return;
    }

    document.getElementById('map-view').classList.add('hidden');
    document.getElementById('pref-chart-container').classList.remove('hidden');

    const ctx = document.getElementById('prefectureHistoryChart').getContext('2d');

    if (prefectureChart) {
        prefectureChart.destroy();
    }

    const weeks = historyItem.history.map(h => `${h.week}週`);
    const values = historyItem.history.map(h => h.value);

    // 閾値設定
    let warningLevel = 0;
    let alertLevel = 0;
    if (disease === 'Influenza') {
        warningLevel = 10.0; // 注意報
        alertLevel = 30.0;   // 警報
    } else if (disease === 'COVID-19') {
        warningLevel = 10.0; // 注意報
        alertLevel = 15.0;   // 警報
    }

    prefectureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: [{
                label: `${prefecture} ${getDiseaseName(disease)} (2025年)`,
                data: values,
                borderColor: '#ccc', // デフォルト色
                backgroundColor: 'rgba(0, 0, 0, 0)',
                tension: 0.1,
                fill: false,
                segment: {
                    borderColor: ctx => {
                        // segmentコンテキストから値を取得
                        if (!ctx.p0.parsed || !ctx.p1.parsed) return '#ccc';

                        const val = Math.max(ctx.p0.parsed.y, ctx.p1.parsed.y);

                        if (val >= alertLevel) return '#e74c3c'; // Alert Red
                        if (val >= warningLevel) return '#f39c12'; // Warning Orange
                        return '#2ecc71'; // Normal Green
                    }
                },
                pointBackgroundColor: ctx => {
                    const val = ctx.parsed.y;
                    if (val >= alertLevel) return '#e74c3c';
                    if (val >= warningLevel) return '#f39c12';
                    return '#2ecc71';
                },
                pointBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `${prefecture} ${getDiseaseName(disease)} 週次推移 (2025年)`,
                    font: { size: 16, family: "'Noto Sans JP', sans-serif" }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '定点当たり報告数' }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        }
    });
}

// Global scope for map.js to call
window.showPrefectureChart = showPrefectureChart;

function closePanel() {
    document.getElementById('region-content').innerHTML = '<p class="placeholder-text">地図上のエリアをクリックすると詳細が表示されます。</p>';
    document.getElementById('region-title').textContent = '地域詳細';
}

document.addEventListener('DOMContentLoaded', init);
