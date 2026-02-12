export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(",")];

  for (const row of data) {
    const values = headers.map((header) => {
      const val = row[header];
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(","));
  }

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportChartAsPNG(chartRef: HTMLElement | null, filename: string) {
  if (!chartRef) return;

  const svg = chartRef.querySelector("svg");
  if (!svg) return;

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    const scale = 2;
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    ctx.scale(scale, scale);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--background")
      ? "hsl(" + getComputedStyle(document.documentElement).getPropertyValue("--background").trim() + ")"
      : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${filename}.png`);
      URL.revokeObjectURL(url);
    });
  };

  img.src = url;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function generateDailyBriefHTML(data: {
  date: string;
  totalArticles: number;
  topTopics: { topic: string; count: number }[];
  sentimentBreakdown: { name: string; value: number }[];
  topSources: { name: string; count: number }[];
}) {
  const { date, totalArticles, topTopics, sentimentBreakdown, topSources } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>NWS360 Daily Brief - ${date}</title>
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a2e; background: #fff; }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb; }
    .logo { width: 40px; height: 40px; background: #3b82f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px; }
    .date { color: #6b7280; font-size: 14px; }
    h1 { margin: 0; font-size: 24px; }
    h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; color: #374151; }
    .metric { display: inline-block; padding: 12px 20px; background: #f3f4f6; border-radius: 8px; margin-right: 12px; margin-bottom: 8px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #111827; }
    .metric-label { font-size: 12px; color: #6b7280; }
    .list { list-style: none; padding: 0; }
    .list li { padding: 8px 0; border-bottom: 1px solid #f3f4f6; display: flex; justify-content: space-between; }
    .count { color: #6b7280; font-size: 14px; }
    .sentiment-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-top: 8px; }
    .sentiment-positive { background: #22c55e; }
    .sentiment-neutral { background: #94a3b8; }
    .sentiment-negative { background: #ef4444; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">N</div>
    <div>
      <h1>NWS360 Daily Brief</h1>
      <p class="date">${date}</p>
    </div>
  </div>

  <div>
    <div class="metric">
      <div class="metric-value">${totalArticles}</div>
      <div class="metric-label">Total Articles</div>
    </div>
    <div class="metric">
      <div class="metric-value">${topTopics.length}</div>
      <div class="metric-label">Trending Topics</div>
    </div>
    <div class="metric">
      <div class="metric-value">${topSources.length}</div>
      <div class="metric-label">Active Sources</div>
    </div>
  </div>

  ${(() => {
    const total = sentimentBreakdown.reduce((s, d) => s + d.value, 0) || 1;
    const pos = sentimentBreakdown.find(d => d.name === "positive")?.value || 0;
    const neu = sentimentBreakdown.find(d => d.name === "neutral")?.value || 0;
    const neg = sentimentBreakdown.find(d => d.name === "negative")?.value || 0;
    return `
    <h2>Tone of Coverage</h2>
    <div class="sentiment-bar">
      <div class="sentiment-positive" style="width: ${(pos / total) * 100}%"></div>
      <div class="sentiment-neutral" style="width: ${(neu / total) * 100}%"></div>
      <div class="sentiment-negative" style="width: ${(neg / total) * 100}%"></div>
    </div>
    <p style="font-size: 13px; color: #6b7280; margin-top: 4px;">
      Positive ${Math.round((pos / total) * 100)}% | Neutral ${Math.round((neu / total) * 100)}% | Negative ${Math.round((neg / total) * 100)}%
    </p>`;
  })()}

  <h2>Trending Topics</h2>
  <ul class="list">
    ${topTopics.slice(0, 10).map(t => `<li><span>${t.topic}</span><span class="count">${t.count} articles</span></li>`).join("")}
  </ul>

  <h2>Top Sources</h2>
  <ul class="list">
    ${topSources.slice(0, 8).map(s => `<li><span>${s.name}</span><span class="count">${s.count} articles</span></li>`).join("")}
  </ul>

  <div class="footer">
    Generated by NWS360 | ${date}
  </div>
</body>
</html>`;
}

export function exportDailyBriefAsPDF(data: Parameters<typeof generateDailyBriefHTML>[0]) {
  const html = generateDailyBriefHTML(data);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
