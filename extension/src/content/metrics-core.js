(function (root) {
  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function aggregate(rows, options = {}) {
    const minimum = Number.isFinite(options.minimum) ? options.minimum : 3;
    const limit = Number.isFinite(options.limit) ? options.limit : 12;
    const validRows = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const views = finiteNumber(row?.views);
      const likes = finiteNumber(row?.likes);
      const comments = finiteNumber(row?.comments);
      const shares = finiteNumber(row?.shares);
      if (row?.engagementKnown !== true || views == null || views <= 0 || likes == null || comments == null || shares == null) continue;
      const engagement = likes + comments + shares;
      if (engagement < 0 || engagement > views) continue;
      validRows.push({ ...row, views, likes, comments, shares, engagement });
      if (validRows.length >= limit) break;
    }
    if (validRows.length < minimum) return { rows: validRows, sampleSize: validRows.length, avgViews: null, avgEngagement: null, engagementRate: null };
    const viewTotal = validRows.reduce((sum, row) => sum + row.views, 0);
    const engagementTotal = validRows.reduce((sum, row) => sum + row.engagement, 0);
    return {
      rows: validRows,
      sampleSize: validRows.length,
      avgViews: Math.round(viewTotal / validRows.length),
      avgEngagement: Math.round(engagementTotal / validRows.length),
      engagementRate: viewTotal > 0 ? (engagementTotal / viewTotal) * 100 : null,
    };
  }

  root.CreatorIntelMetricsCore = Object.freeze({ aggregate });
})(globalThis);
