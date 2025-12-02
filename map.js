// Japan Map SVG Data and Rendering Logic
const JAPAN_PREFECTURES = [
    { code: 1, name: "北海道", region: "Hokkaido-Tohoku", path: "M..." }, // Simplified for brevity, will use real paths
    // ... (Full list of 47 prefectures with paths would be here)
    // For this implementation, we will generate a simplified grid/tile map or use a library if paths are too complex for inline.
    // Given the constraints, I will implement a "Tile Map" style which is modern and easier to maintain inline, 
    // or fetch a standard SVG. Let's use a structured SVG generation approach.
];

// Simplified SVG Paths for a recognizable Japan Map (Low Poly style for aesthetics)
// This is a placeholder. In a real scenario, we'd load a detailed topojson/geojson or a high-quality SVG.
// For this demo, I will construct a functional SVG map programmatically.

const REGIONS = {
    "Hokkaido": ["北海道"],
    "Tohoku": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    "Kanto": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    "Chubu": ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
    "Kansai": ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    "Chugoku": ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
    "Shikoku": ["徳島県", "香川県", "愛媛県", "高知県"],
    "Kyushu": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]
};

function renderJapanMap(containerId, data, disease) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Map container '${containerId}' not found.`);
        return;
    }
    container.innerHTML = ''; // Clear previous map

    // Create SVG element
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    // 地図の描画範囲に合わせてviewBoxを調整し、下の余白を削除
    svg.setAttribute("viewBox", "0 0 800 600");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.filter = "drop-shadow(0 4px 6px rgba(0,0,0,0.1))";

    // Draw regions (simplified geometric representation for demo purposes)
    // In a production app, we would use actual geo-coordinates. 
    // Here we simulate with a stylized layout.

    // Layout configuration (x, y coordinates for regions)
    const layout = [
        { id: "Hokkaido", x: 600, y: 50, w: 120, h: 100, label: "北海道" },
        { id: "Tohoku", x: 600, y: 160, w: 100, h: 180, label: "東北" },
        { id: "Kanto", x: 580, y: 350, w: 100, h: 100, label: "関東" },
        { id: "Chubu", x: 470, y: 330, w: 100, h: 140, label: "中部" },
        { id: "Kansai", x: 360, y: 380, w: 100, h: 100, label: "関西" },
        { id: "Chugoku", x: 250, y: 380, w: 100, h: 80, label: "中国" },
        { id: "Shikoku", x: 280, y: 470, w: 100, h: 60, label: "四国" },
        { id: "Kyushu", x: 130, y: 420, w: 100, h: 120, label: "九州・沖縄" }
    ];

    layout.forEach(region => {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("class", "region-group");
        group.setAttribute("data-region", region.id);
        group.style.cursor = "pointer";

        // Calculate average value for the region to determine color
        const regionPrefectures = REGIONS[region.id];
        let totalValue = 0;
        let count = 0;

        regionPrefectures.forEach(pref => {
            const prefData = data.data.find(d => d.disease === disease && d.prefecture === pref);
            if (prefData) {
                totalValue += prefData.value;
                count++;
            }
        });

        const avgValue = count > 0 ? totalValue / count : 0;
        const color = getColorForValue(avgValue, disease);

        // Draw region shape (Hexagon or rounded rect for modern look)
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", region.x);
        rect.setAttribute("y", region.y);
        rect.setAttribute("width", region.w);
        rect.setAttribute("height", region.h);
        rect.setAttribute("rx", 10); // Rounded corners
        rect.setAttribute("fill", color);
        rect.setAttribute("stroke", "white");
        rect.setAttribute("stroke-width", 2);

        // Add hover effect via CSS class, but we can also add events here
        rect.addEventListener('mouseover', () => {
            rect.setAttribute("stroke", "#333");
            rect.style.filter = "brightness(1.1)";
        });
        rect.addEventListener('mouseout', () => {
            rect.setAttribute("stroke", "white");
            rect.style.filter = "none";
        });

        // Click event to show details
        group.addEventListener('click', () => {
            showRegionDetails(region.id, region.label, regionPrefectures, data, disease);
        });

        // Label
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", region.x + region.w / 2);
        text.setAttribute("y", region.y + region.h / 2);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("fill", "white");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("font-size", "14px");
        text.style.pointerEvents = "none"; // Let clicks pass through to rect
        text.textContent = region.label;

        group.appendChild(rect);
        group.appendChild(text);
        svg.appendChild(group);
    });

    container.appendChild(svg);
}

function getColorForValue(value, disease) {
    if (disease === 'Influenza') {
        if (value >= 30.0) return "#e74c3c"; // Alert Red
        if (value >= 10.0) return "#f39c12"; // Warning Orange
        if (value >= 1.0) return "#f1c40f";  // Caution Yellow
        return "#2ecc71";                    // Normal Green
    } else if (disease === 'COVID-19') {
        if (value >= 15.0) return "#e74c3c"; // Alert Red
        if (value >= 10.0) return "#f39c12"; // Warning Orange
        // 1.0以上での黄色判定を削除（注意報レベル未満は緑）
        return "#2ecc71";                    // Normal Green
    } else {
        // ARI
        if (value >= 120.0) return "#e74c3c"; // 流行期
        if (value >= 80.0) return "#f39c12";  // 注意
        // if (value >= 5.0) return "#f1c40f"; // 黄色判定も一旦削除または調整
        return "#2ecc71";
    }
}

function showRegionDetails(regionId, regionLabel, prefectures, data, disease) {
    const panel = document.getElementById('detail-panel');
    const title = document.getElementById('region-title');
    const content = document.getElementById('region-content');

    title.textContent = `${regionLabel} 詳細 (${getDiseaseName(disease)})`;
    content.innerHTML = ''; // Clear content

    const list = document.createElement('div');
    list.className = 'prefecture-list';

    // Sort prefectures by value (descending)
    const sortedPrefs = prefectures.map(pref => {
        const prefData = data.data.find(d => d.disease === disease && d.prefecture === pref);
        return {
            name: pref,
            value: prefData ? prefData.value : 0
        };
    }).sort((a, b) => b.value - a.value);

    // Get max value for scaling bar width
    const maxValue = Math.max(...sortedPrefs.map(item => item.value));

    sortedPrefs.forEach(item => {
        const row = document.createElement('div');
        row.className = 'pref-row';

        // Determine status class
        let statusClass = 'normal';
        if (disease === 'Influenza') {
            if (item.value >= 30.0) statusClass = 'alert';
            else if (item.value >= 10.0) statusClass = 'warning';
        } else if (disease === 'COVID-19') {
            if (item.value >= 15.0) statusClass = 'alert';
            else if (item.value >= 10.0) statusClass = 'warning';
        } else {
            // ARI
            if (item.value >= 120.0) statusClass = 'alert';
            else if (item.value >= 80.0) statusClass = 'warning';
        }

        row.innerHTML = `
            <span class="pref-name" style="cursor:pointer; text-decoration:underline;">${item.name}</span>
            <div class="pref-bar-container">
                <div class="pref-bar ${statusClass}" style="width: ${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%"></div>
            </div>
            <span class="pref-value">${item.value.toFixed(2)}</span>
        `;
        // Add click event to pref-name
        const nameSpan = row.querySelector('.pref-name');
        nameSpan.addEventListener('click', () => {
            if (window.showPrefectureChart) {
                window.showPrefectureChart(item.name, disease);
            }
        });
        list.appendChild(row);
    });

    content.appendChild(list);

    // Add some CSS for the list dynamically or ensure it's in style.css
    // For now, let's assume basic styles are handled or add inline for safety
    const style = document.createElement('style');
    style.textContent = `
        .prefecture-list { display: flex; flex-direction: column; gap: 10px; }
        .pref-row { display: flex; align-items: center; gap: 10px; }
        .pref-name { width: 80px; font-weight: bold; }
        .pref-bar-container { flex-grow: 1; background: #eee; height: 10px; border-radius: 5px; overflow: hidden; }
        .pref-bar { height: 100%; transition: width 0.5s ease; }
        .pref-bar.alert { background: #e74c3c; }
        .pref-bar.warning { background: #f39c12; }
        .pref-bar.normal { background: #2ecc71; }
        .pref-value { width: 50px; text-align: right; font-family: 'Inter', sans-serif; }
    `;
    content.appendChild(style);
}
