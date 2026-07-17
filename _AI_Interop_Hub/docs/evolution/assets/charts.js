(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var danger = style.getPropertyValue('--danger').trim();
  var success = style.getPropertyValue('--success').trim();

  // ============================================================
  // Chart 1: Radar — 6 层标准框架完成度
  // ============================================================
  var radarEl = document.getElementById('chart-radar');
  if (radarEl) {
    var radarChart = echarts.init(radarEl, null, { renderer: 'svg' });
    radarChart.setOption({
      animation: false,
      tooltip: {
        trigger: 'item',
        appendToBody: true
      },
      legend: {
        data: ['当前完成度', 'V3.7 目标', 'V4.0 目标'],
        bottom: 0,
        textStyle: { color: muted, fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8
      },
      radar: {
        center: ['50%', '48%'],
        radius: '65%',
        indicator: [
          { name: '增强 LLM', max: 100 },
          { name: '编排', max: 100 },
          { name: '本体', max: 100 },
          { name: '协议', max: 100 },
          { name: '生命周期', max: 100 },
          { name: '治理', max: 100 }
        ],
        axisName: { color: ink, fontSize: 12 },
        splitArea: {
          areaStyle: { color: ['rgba(56,189,248,0.02)', 'rgba(56,189,248,0.04)'] }
        },
        splitLine: { lineStyle: { color: rule } },
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'radar',
        name: '当前完成度',
        data: [{ value: [30, 40, 25, 0, 10, 5], name: '当前 V3.6' }],
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: accent, width: 2 },
        areaStyle: { color: 'rgba(56,189,248,0.15)' },
        itemStyle: { color: accent }
      }, {
        type: 'radar',
        name: 'V3.7 目标',
        data: [{ value: [45, 55, 55, 5, 15, 10], name: 'V3.7' }],
        symbol: 'diamond',
        symbolSize: 6,
        lineStyle: { color: accent2, width: 2, type: 'dashed' },
        areaStyle: { color: 'rgba(245,158,11,0.08)' },
        itemStyle: { color: accent2 }
      }, {
        type: 'radar',
        name: 'V4.0 目标',
        data: [{ value: [85, 90, 85, 80, 75, 70], name: 'V4.0' }],
        symbol: 'triangle',
        symbolSize: 6,
        lineStyle: { color: success, width: 2, type: 'dashed' },
        areaStyle: { color: 'rgba(34,197,94,0.06)' },
        itemStyle: { color: success }
      }]
    });
    window.addEventListener('resize', function() { radarChart.resize(); });
  }

  // ============================================================
  // Chart 2: Bar — 6 层框架缺口分析
  // ============================================================
  var gapEl = document.getElementById('chart-gap');
  if (gapEl) {
    var gapChart = echarts.init(gapEl, null, { renderer: 'svg' });
    var layers = ['增强 LLM', '编排', '本体', '协议', '生命周期', '治理'];
    var completed = [30, 40, 25, 0, 10, 5];
    var missing = completed.map(function(v) { return 100 - v; });

    gapChart.setOption({
      animation: false,
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        axisPointer: { type: 'shadow' },
        formatter: function(params) {
          var layer = params[0].name;
          var c = params[0].value;
          var m = params[1].value;
          return layer + '<br/>已完成: ' + c + '%<br/>缺失: ' + m + '%';
        }
      },
      legend: {
        data: ['已完成', '缺失'],
        bottom: 0,
        textStyle: { color: muted, fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8
      },
      grid: { left: '3%', right: '4%', bottom: '12%', top: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: layers,
        axisLabel: { color: ink, fontSize: 11 },
        axisLine: { lineStyle: { color: rule } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        max: 100,
        axisLabel: { color: muted, fontSize: 11, formatter: '{value}%' },
        splitLine: { lineStyle: { color: rule } },
        axisLine: { show: false }
      },
      series: [{
        name: '已完成',
        type: 'bar',
        stack: 'total',
        data: completed,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: accent },
            { offset: 1, color: 'rgba(56,189,248,0.4)' }
          ]),
          borderRadius: [4, 4, 0, 0]
        },
        label: {
          show: true,
          position: 'inside',
          color: '#0a0e17',
          fontSize: 11,
          fontWeight: 600,
          formatter: function(p) { return p.value > 0 ? p.value + '%' : ''; }
        },
        barWidth: 40
      }, {
        name: '缺失',
        type: 'bar',
        stack: 'total',
        data: missing,
        itemStyle: {
          color: 'rgba(30,45,69,0.6)',
          borderRadius: [0, 0, 0, 0]
        },
        label: {
          show: true,
          position: 'top',
          color: danger,
          fontSize: 11,
          fontWeight: 600,
          formatter: function(p) { return p.value >= 70 ? p.value + '%' : ''; }
        },
        barWidth: 40
      }]
    });
    window.addEventListener('resize', function() { gapChart.resize(); });
  }
})();