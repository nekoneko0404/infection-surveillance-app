const API_URL = 'https://script.google.com/macros/s/AKfycbype0mQoW1TFTwHEkZY2GJ2G5niXoJwSgElUyR9xWMVtmfmxUarhhPhoTIsY3M4a2mKFw/exec';
let cachedData = null;
let currentDisease = 'Influenza';
let prefectureChart = null;
let currentRegionId = null;
let currentPrefecture = null;

window.setCurrentRegion = function (regionId) {
    currentRegionId = regionId;
    currentPrefecture = null; // グラフモード解除
};

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
    if (!rows || rows.length < 5) {
        console.warn('Rows are empty or too short', rows);
        return [];
    }

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

        const prefName = String(row[0] || '').trim();
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
        const prefName = String(row[0] || '').trim();
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
    let influenzaStartRow = -1;
    let covidStartRow = -1;

    for (let i = 0; i < rows.length; i++) {
        const rowStr = String(rows[i][0] || '') + String(rows[i][1] || ''); // 0列目か1列目あたりに含まれると想定
        // より安全に: 行全体を文字列化して検索 (ただしカンマ区切りになるので注意)
        // const rowAllStr = rows[i].join(',');
        // 今回は単純に1列目(疾患名ヘッダーの可能性)をチェック

        // rows[i]自体が配列なので、rows[i][0]などをチェックすべきだが、
        // Tougai(統計)データの構造が不明確なので、行全体を文字列化して判定するアプローチはあながち間違いではないが、
        // rows[i] は配列なので String(rows[i]) は "col1,col2..." となる。
        // なので元のコード `String(rows[i] || '')` は動くが、意図として不明瞭。
        // ここは安全策として join を使う
        const rowContent = rows[i].join('');
        if (rowContent.includes('インフルエンザ')) influenzaStartRow = i;
        if (rowContent.includes('COVID-19') || rowContent.includes('新型コロナ')) covidStartRow = i;
    }


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
    const weekHeaderRow = rows[startRowIndex + 1];
    const typeHeaderRow = rows[startRowIndex + 2];

    const weekColumns = []; // { week: 1, colIndex: 5 }

    for (let i = 0; i < weekHeaderRow.length; i++) {
        const weekText = weekHeaderRow[i];
        const match = weekText.match(/(\d{1,2})週/);
        if (match) {
            if ((typeHeaderRow[i] || '').includes('定当')) {
                weekColumns.push({ week: parseInt(match), colIndex: i });
            } else if ((typeHeaderRow[i + 1] || '').includes('定当')) {
                weekColumns.push({ week: parseInt(match), colIndex: i + 1 });
            }
        }
    }

    // データ抽出
    for (let i = startRowIndex + 3; i < rows.length; i++) {
        const row = rows[i];
        const prefName = String(row[0] || '').trim();
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
                if (value >= 30.0) { level = 'alert'; message = '全国的に警報レベルです。'; }
                else if (value >= 10.0) { level = 'warning'; message = '全国的に注意報レベルです。'; }
                else if (value >= 1.0) { level = 'normal'; message = '全国的に流行入りしています。'; }
            } else if (disease === 'COVID-19') {
                if (value >= 15.0) { level = 'alert'; message = '高い感染レベルです。'; }
                else if (value >= 10.0) { level = 'warning'; message = '注意が必要です。'; }
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
    if (!container) return;
    container.innerHTML = '';
    const diseases = ['Influenza', 'COVID-19', 'ARI'];
    diseases.forEach(disease => {
        const nationalData = data.data.find(d => d.disease === disease && d.prefecture === '全国');
        const alert = data.summary.alerts.find(a => a.disease === disease);

        const card = document.createElement('div');
        card.className = `card ${currentDisease === disease ? 'active' : ''}`;
        card.dataset.disease = disease;
        card.dataset.status = alert ? alert.level : 'normal';
        card.onclick = () => switchDisease(disease);

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

    document.querySelectorAll('.summary-cards .card').forEach(card => {
        card.classList.toggle('active', card.dataset.disease === disease);
    });

    const titleElement = document.getElementById('current-disease-title');
    if (titleElement) {
        titleElement.textContent = `${getDiseaseName(disease)} 全国状況`;
    }

    // グラフ表示モード（都道府県選択中）の場合は、グラフを更新して維持する
    if (currentPrefecture) {
        showPrefectureChart(currentPrefecture, disease);
    } else {
        // 地図モードの場合は地図を表示
        const mapView = document.getElementById('map-view');
        const prefChartContainer = document.getElementById('pref-chart-container');
        if (mapView && prefChartContainer) {
            mapView.classList.remove('hidden');
            prefChartContainer.classList.add('hidden');
        }
    }

    // 右パネルの更新（地域詳細パネル）
    // グラフ表示中も、その都道府県の詳細データを表示し続けるのが自然
    // ただし、currentRegionId は showPrefectureChart で null にされることがあるため、
    // currentPrefecture がある場合はその ID を特定するか、
    // 既存のロジック（updateDetailPanel）が ID ベースなら ID が必要。
    // showPrefectureChart では currentRegionId = null にしているが、
    // updateDetailPanel は regionId を引数にとる。
    // ここでは、地図モードの時のみ updateDetailPanel を呼ぶか、
    // あるいは currentPrefecture から regionId を逆引きできればベストだが、
    // 簡易的に「地図モードで選択中の場合」のみ更新し、グラフモードでは詳細パネルは
    // そのまま（あるいは閉じる）とするのが安全かもしれない。
    // しかし、要望は「そのままその都道府県のグラフを表示」なので、右パネルの挙動については
    // 明示されていないが、整合性を保つなら閉じるか、その県の情報を出すべき。
    // 現状の switchDisease の実装では、currentRegionId があれば updateDetailPanel を呼んでいる。
    // showPrefectureChart で currentRegionId = null になるので、
    // グラフモードではここはスキップされるはず。

    if (!currentPrefecture) {
        if (currentRegionId && typeof window.updateDetailPanel === 'function' && cachedData) {
            window.updateDetailPanel(currentRegionId, cachedData, disease);
        } else {
            closePanel();
        }
    } else {
        // グラフモードの時も、その都道府県が含まれる地域の詳細を表示する
        if (typeof window.getRegionIdByPrefecture === 'function' && typeof window.updateDetailPanel === 'function' && cachedData) {
            const regionId = window.getRegionIdByPrefecture(currentPrefecture);
            if (regionId) {
                window.updateDetailPanel(regionId, cachedData, disease);
            } else {
                closePanel();
            }
        } else {
            closePanel();
        }
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
    if (disease === 'ARI') return;

    currentPrefecture = prefecture;
    currentRegionId = null;

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

    const weeks = historyItem.history.map(h => `${h.week}週`);
    const values = historyItem.history.map(h => h.value);

    let warningLevel = 0;
    let alertLevel = 0;
    if (disease === 'Influenza') {
        warningLevel = 10.0;
        alertLevel = 30.0;
    } else if (disease === 'COVID-19') {
        warningLevel = 10.0;
        alertLevel = 15.0;
    }

    prefectureChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: [{
                label: `${prefecture} ${getDiseaseName(disease)} (2025年)`,
                data: values,
                borderColor: '#ccc',
                backgroundColor: 'rgba(0, 0, 0, 0)',
                tension: 0.1,
                fill: false,
                segment: {
                    borderColor: ctx => {
                        if (!ctx.p0.parsed || !ctx.p1.parsed) return '#ccc';
                        const val = Math.max(ctx.p0.parsed.y, ctx.p1.parsed.y);
                        if (val >= alertLevel) return '#e74c3c';
                        if (val >= warningLevel) return '#f39c12';
                        return '#2ecc71';
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
window.showPrefectureChart = showPrefectureChart;

function closePanel() {
    const content = document.getElementById('region-content');
    if (content) {
        content.innerHTML = '<p class="placeholder-text">地図上のエリアをクリックすると詳細が表示されます。</p>';
    }
    const title = document.getElementById('region-title');
    if (title) {
        title.textContent = '地域詳細';
    }
}

function updateLoadingState(isLoading) {
    const container = document.body;
    if (isLoading) {
        container.classList.add('loading');
    } else {
        container.classList.remove('loading');
    }
}

async function init() {
    try {
        updateLoadingState(true);

        const accordionToggle = document.getElementById('accordion-toggle');
        const accordionContent = document.getElementById('accordion-content');
        if (accordionToggle && accordionContent) {
            accordionToggle.addEventListener('click', () => {
                accordionContent.classList.toggle('open');
                accordionToggle.classList.toggle('open');
            });
        }

        const [teitenCsv, ariCsv, tougaiCsv] = await Promise.all([
            fetchCSV('Teiten'),
            fetchCSV('ARI'),
            fetchCSV('Tougai')
        ]);

        const teitenData = parseCSV(teitenCsv);
        const ariData = parseCSV(ariCsv);
        const tougaiData = parseCSV(tougaiCsv);

        cachedData = processData(teitenData, ariData, tougaiData);

        const dateMatch = teitenCsv.match(/(\d{4})年(\d{1,2})週(?:\((.*?)\))?/);
        const dateElement = document.getElementById('update-date');
        if (dateElement) {
            if (dateMatch) {
                const year = dateMatch[1];
                const week = dateMatch[2];
                let dateRange = dateMatch[3];

                if (dateRange) {
                    // Convert 11月17日〜11月23日 to 11/17～11/23
                    dateRange = dateRange.replace(/月/g, '/').replace(/日/g, '').replace(/[〜~]/g, '～');
                    dateElement.textContent = `${year}年 第${week}週 （${dateRange}）`;
                } else {
                    dateElement.textContent = `${year}年 第${week}週`;
                }
            } else {
                dateElement.textContent = new Date().toLocaleDateString('ja-JP');
            }
        }

        const backBtn = document.getElementById('back-to-map-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                document.getElementById('map-view').classList.remove('hidden');
                document.getElementById('pref-chart-container').classList.add('hidden');
                currentPrefecture = null;
            });
        }

        renderSummary(cachedData);
        renderDashboard(currentDisease, cachedData);

        // 地域詳細パネルの初期表示（「地図上のエリアをクリック...」を表示）
        closePanel();

        // データの取得・処理が終わってから少し待つ（アニメーションを見せるため）
        await new Promise(resolve => setTimeout(resolve, 500));
        updateLoadingState(false);

    } catch (error) {
        console.error('Error fetching data:', error);
        const summaryCards = document.getElementById('summary-cards');
        if (summaryCards) {
            summaryCards.innerHTML = `<p class="error">データの取得に失敗しました。詳細: ${error.message}</p>`;
        }
        updateLoadingState(false);
    }
}

document.addEventListener('DOMContentLoaded', init);
