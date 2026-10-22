/**
 * ============================================================================
 * ENG Sightline & Stage Simulator Mark2
 * モジュール：【ノート1：会場】 tab1_room.js
 * 
 * 担当機能：
 *  - 会場基本寸法（W: 16000, D: 24000, H: 5000）
 *  - 多角形成形（正多角形・L字プリセット、辺の増減、頂点マウスドラッグ）
 *  - 壁吸着扉（片開き左右、両開き、閉鎖、壁面スナップ・スライドドラッグ）
 *  - 平面図（外郭線・頂点ハンドル・扉円弧・外周CAD寸法線）描画
 *  - 立面図（横軸=Y、縦軸=-Z の統一座標系による床面・天井・奥壁断面）描画
 *  - hitTest / handleDrag によるマウスドラッグ操作
 *  - exportData / importData による Undo / Redo 完全連動
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. 単一データ源（Single Source of Truth）初期化
  // ==========================================================================
  window.room = window.room || {};
  if (typeof window.room.w !== 'number') window.room.w = 16000;
  if (typeof window.room.d !== 'number') window.room.d = 24000;
  if (typeof window.room.h !== 'number') window.room.h = window.room.ceilingH || 5000;
  window.room.ceilingH = window.room.h; // 互換性保持
  if (!window.room.shapeType) window.room.shapeType = 'rect';

  if (!Array.isArray(window.room.points) || window.room.points.length < 3) {
    window.room.points = [
      { x: 0, y: 0 },
      { x: window.room.w, y: 0 },
      { x: window.room.w, y: window.room.d },
      { x: 0, y: window.room.d }
    ];
  }

  // 扉データ (壁面吸着スナップ方式: edgeIndex と offsetRatio 0.05〜0.95 で密着)
  window.doors = window.doors || [
    { id: 'D1', name: '正面主搬入口', type: 'double', width: 1800, edgeIndex: 2, offsetRatio: 0.5, status: 'open' },
    { id: 'D2', name: '上手袖扉', type: 'single_left', width: 900, edgeIndex: 1, offsetRatio: 0.15, status: 'open' }
  ];
  window.selectedDoorId = window.selectedDoorId || (window.doors[0] ? window.doors[0].id : 'D1');

  // ==========================================================================
  // 2. UIテンプレート自動生成 (#panel-room へのインジェクション)
  // ==========================================================================
  function injectRoomUI() {
    const container = document.getElementById('panel-room');
    if (!container) return;

    container.innerHTML = `
      <!-- 会場外形 & 天井高 -->
      <div class="ui-group">
        <div class="ui-group-title">
          <span>🏛 会場外形 & 天井高</span>
          <select id="roomShapeType" style="font-size:11px; padding:1px 4px;">
            <option value="rect" ${window.room.shapeType === 'rect' ? 'selected' : ''}>四角形 (基本)</option>
            <option value="polygon" ${window.room.shapeType === 'polygon' ? 'selected' : ''}>多角形成形 (カスタム)</option>
          </select>
        </div>

        <!-- 基本寸法入力 -->
        <div class="ui-row" id="roomBasicDimsRow" style="${window.room.shapeType === 'polygon' ? 'display:none;' : ''}">
          <div class="input-box">
            <label>間口幅 (W mm)</label>
            <input type="number" id="roomW" value="${window.room.w}" step="500">
          </div>
          <div class="input-box">
            <label>奥行 (D mm)</label>
            <input type="number" id="roomD" value="${window.room.d}" step="500">
          </div>
          <div class="input-box">
            <label>天井高 (H mm)</label>
            <input type="number" id="roomH" value="${window.room.h}" step="100">
          </div>
        </div>

        <!-- 多角形成形コントロール -->
        <div id="polygonConfigGroup" style="${window.room.shapeType === 'polygon' ? 'display:block;' : 'display:none;'} margin-top:6px;">
          <div class="ui-row">
            <div class="input-box">
              <label style="color:#0284c7; font-weight:bold;">多角形プリセット</label>
              <select id="polyEdgeCount">
                <option value="3">3角形 (三角形)</option>
                <option value="4" selected>4角形 (四角形)</option>
                <option value="5">5角形 (五角形)</option>
                <option value="6">6角形 (六角形)</option>
                <option value="8">8角形 (八角形)</option>
                <option value="L">L字型 (変形6角形)</option>
              </select>
            </div>
            <div class="input-box">
              <label>天井高 (H mm)</label>
              <input type="number" id="roomHPoly" value="${window.room.h}" step="100">
            </div>
          </div>
          <div class="ui-row full" style="justify-content:flex-end; gap:6px; margin-top:4px;">
            <button class="btn-action" id="btnAddVertex" style="font-size:10px; padding:3px 8px;">＋ 頂点追加</button>
            <button class="btn-action" id="btnResetRect" style="font-size:10px; padding:3px 8px; background:#f1f5f9; color:#0369a1;">四角リセット</button>
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:4px;">
            💡 図面上の「青丸ハンドル」をマウスドラッグして会場の角を自由に変形できます。
          </div>
        </div>
      </div>

      <!-- 扉・搬入口 (壁面吸着スナップ) -->
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>🚪 扉・搬入口 (壁面密着スナップ)</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-action" id="btnAddDoor" style="padding:2px 6px; font-size:10px;">＋ 扉追加</button>
            <button class="btn-action btn-danger" id="btnDeleteDoor" style="padding:2px 6px; font-size:10px;">削除</button>
          </div>
        </div>

        <div class="ui-row full">
          <div class="input-box">
            <label>選択中の扉</label>
            <select id="doorSelect"></select>
          </div>
        </div>

        <div id="doorEditSection">
          <div class="ui-row">
            <div class="input-box">
              <label>扉名称</label>
              <input type="text" id="doorName" value="扉">
            </div>
            <div class="input-box">
              <label>扉の種別</label>
              <select id="doorType">
                <option value="single_left">片開き (左開き)</option>
                <option value="single_right">片開き (右開き)</option>
                <option value="double">2枚 (両開き)</option>
                <option value="closed">閉鎖 (開閉不可)</option>
              </select>
            </div>
          </div>

          <div class="ui-row">
            <div class="input-box">
              <label>開口幅 (W mm)</label>
              <input type="number" id="doorWidth" value="1200" step="100">
            </div>
            <div class="input-box">
              <label style="color:#0284c7; font-weight:bold;">設置する壁 (辺)</label>
              <select id="doorWallSelect"></select>
            </div>
          </div>

          <div class="ui-row full">
            <div class="input-box" style="flex:1;">
              <label>壁上の位置: <span id="doorRatioDisplay" style="font-weight:bold; color:#0284c7;">50%</span></label>
              <input type="range" id="doorWallRatio" min="5" max="95" step="1" value="50">
            </div>
          </div>

          <div style="font-size:10px; color:#64748b; margin-top:2px;">
            💡 図面上の扉をドラッグすると、最寄りの壁に自動吸着してスライド移動します。
          </div>
        </div>
      </div>
    `;

    bindRoomUIEvents();
    syncUI();
  }

  // ==========================================================================
  // 3. UIイベントリスナー登録
  // ==========================================================================
  function bindRoomUIEvents() {
    // 形状タイプ切替
    document.getElementById('roomShapeType').addEventListener('change', function (e) {
      pushUndo();
      window.room.shapeType = e.target.value;
      const isPoly = (window.room.shapeType === 'polygon');
      document.getElementById('roomBasicDimsRow').style.display = isPoly ? 'none' : 'grid';
      document.getElementById('polygonConfigGroup').style.display = isPoly ? 'block' : 'none';

      if (isPoly && window.room.points.length < 3) {
        applyPolygonPreset('4');
      }
      recalculateRoomBounds();
      syncUI();
      triggerRender();
    });

    // 四角形寸法変更
    const onDimChange = function () {
      pushUndo();
      window.room.w = parseFloat(document.getElementById('roomW').value) || 16000;
      window.room.d = parseFloat(document.getElementById('roomD').value) || 24000;
      const hVal = parseFloat(document.getElementById('roomH').value) || 5000;
      window.room.h = hVal;
      window.room.ceilingH = hVal;

      if (window.room.shapeType === 'rect') {
        window.room.points = [
          { x: 0, y: 0 },
          { x: window.room.w, y: 0 },
          { x: window.room.w, y: window.room.d },
          { x: 0, y: window.room.d }
        ];
      }
      recalculateRoomBounds();
      syncUI();
      triggerRender();
    };

    document.getElementById('roomW').addEventListener('change', onDimChange);
    document.getElementById('roomD').addEventListener('change', onDimChange);
    document.getElementById('roomH').addEventListener('change', onDimChange);

    // 多角形時の天井高
    document.getElementById('roomHPoly').addEventListener('change', function (e) {
      pushUndo();
      const val = parseFloat(e.target.value) || 5000;
      window.room.h = val;
      window.room.ceilingH = val;
      document.getElementById('roomH').value = val;
      triggerRender();
    });

    // 多角形プリセット
    document.getElementById('polyEdgeCount').addEventListener('change', function (e) {
      pushUndo();
      applyPolygonPreset(e.target.value);
    });

    // 頂点追加 / 四角リセット
    document.getElementById('btnAddVertex').addEventListener('click', function () {
      pushUndo();
      addPolygonVertex();
    });

    document.getElementById('btnResetRect').addEventListener('click', function () {
      pushUndo();
      window.room.shapeType = 'rect';
      window.room.points = [
        { x: 0, y: 0 },
        { x: window.room.w, y: 0 },
        { x: window.room.w, y: window.room.d },
        { x: 0, y: window.room.d }
      ];
      recalculateRoomBounds();
      syncUI();
      triggerRender();
    });

    // 扉の追加・削除・選択
    document.getElementById('btnAddDoor').addEventListener('click', addNewDoor);
    document.getElementById('btnDeleteDoor').addEventListener('click', deleteSelectedDoor);
    document.getElementById('doorSelect').addEventListener('change', function (e) {
      window.selectedDoorId = e.target.value;
      syncSelectedDoorToUI();
      triggerRender();
    });

    // 扉パラメータ変更
    const onDoorParamChange = function () {
      const d = window.doors.find(item => item.id === window.selectedDoorId);
      if (!d) return;
      pushUndo();
      d.name = document.getElementById('doorName').value.trim() || '扉';
      d.type = document.getElementById('doorType').value;
      d.width = parseFloat(document.getElementById('doorWidth').value) || 1000;
      d.edgeIndex = parseInt(document.getElementById('doorWallSelect').value, 10) || 0;
      d.offsetRatio = (parseFloat(document.getElementById('doorWallRatio').value) || 50) / 100;
      document.getElementById('doorRatioDisplay').innerText = Math.round(d.offsetRatio * 100) + '%';
      updateDoorSelectOptions();
      triggerRender();
    };

    document.getElementById('doorName').addEventListener('input', onDoorParamChange);
    document.getElementById('doorType').addEventListener('change', onDoorParamChange);
    document.getElementById('doorWidth').addEventListener('change', onDoorParamChange);
    document.getElementById('doorWallSelect').addEventListener('change', onDoorParamChange);
    document.getElementById('doorWallRatio').addEventListener('input', function (e) {
      document.getElementById('doorRatioDisplay').innerText = e.target.value + '%';
      onDoorParamChange();
    });
  }

  // ==========================================================================
  // 4. 多角形成形幾何ロジック
  // ==========================================================================
  function applyPolygonPreset(preset) {
    const cx = window.room.w / 2;
    const cy = window.room.d / 2;
    const rx = window.room.w * 0.45;
    const ry = window.room.d * 0.45;

    if (preset === 'L') {
      window.room.points = [
        { x: 0, y: 0 },
        { x: window.room.w, y: 0 },
        { x: window.room.w, y: Math.round(window.room.d * 0.55) },
        { x: Math.round(window.room.w * 0.45), y: Math.round(window.room.d * 0.55) },
        { x: Math.round(window.room.w * 0.45), y: window.room.d },
        { x: 0, y: window.room.d }
      ];
    } else {
      const n = parseInt(preset, 10) || 4;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI / n) * i - Math.PI / 2;
        pts.push({
          x: Math.round(cx + rx * Math.cos(angle)),
          y: Math.round(cy + ry * Math.sin(angle))
        });
      }
      window.room.points = pts;
    }
    recalculateRoomBounds();
    syncUI();
    triggerRender();
  }

  function addPolygonVertex() {
    const pts = window.room.points;
    if (pts.length < 3) return;
    const last = pts[pts.length - 1];
    const first = pts[0];
    pts.push({
      x: Math.round((last.x + first.x) / 2),
      y: Math.round((last.y + first.y) / 2)
    });
    recalculateRoomBounds();
    syncUI();
    triggerRender();
  }

  function recalculateRoomBounds() {
    const pts = window.room.points;
    if (!pts || pts.length === 0) return;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    // 原点(0,0)へシフト正規化
    pts.forEach(p => { p.x -= minX; p.y -= minY; });
    window.room.w = Math.max(1000, maxX - minX);
    window.room.d = Math.max(1000, maxY - minY);

    // 扉の壁番号が頂点数を超えないよう調整
    const maxEdge = pts.length - 1;
    window.doors.forEach(d => {
      if (d.edgeIndex > maxEdge) d.edgeIndex = maxEdge;
    });

    updateHUDStats();
  }

  function updateHUDStats() {
    const rw = document.getElementById('roomW');
    const rd = document.getElementById('roomD');
    if (rw) rw.value = Math.round(window.room.w);
    if (rd) rd.value = Math.round(window.room.d);

    const statRoom = document.getElementById('statRoom');
    if (statRoom) {
      statRoom.innerText = `${(window.room.w / 1000).toFixed(1)}m × ${(window.room.d / 1000).toFixed(1)}m`;
    }
  }

  // ==========================================================================
  // 5. 扉制御・壁面吸着スナップ
  // ==========================================================================
  function updateDoorWallSelectOptions() {
    const sel = document.getElementById('doorWallSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const numEdges = window.room.points.length;
    for (let i = 0; i < numEdges; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `壁(辺) ${i + 1}`;
      sel.appendChild(opt);
    }
  }

  function updateDoorSelectOptions() {
    const sel = document.getElementById('doorSelect');
    if (!sel) return;
    sel.innerHTML = '';
    window.doors.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name} (${d.width}mm)`;
      sel.appendChild(opt);
    });
    sel.value = window.selectedDoorId;
  }

  function syncSelectedDoorToUI() {
    const d = window.doors.find(item => item.id === window.selectedDoorId);
    if (!d) return;
    const dn = document.getElementById('doorName');
    const dt = document.getElementById('doorType');
    const dw = document.getElementById('doorWidth');
    const dws = document.getElementById('doorWallSelect');
    const dwr = document.getElementById('doorWallRatio');
    const drd = document.getElementById('doorRatioDisplay');

    if (dn) dn.value = d.name;
    if (dt) dt.value = d.type;
    if (dw) dw.value = d.width;
    if (dws) dws.value = d.edgeIndex;
    const ratioVal = Math.round((d.offsetRatio || 0.5) * 100);
    if (dwr) dwr.value = ratioVal;
    if (drd) drd.innerText = ratioVal + '%';
  }

  function addNewDoor() {
    pushUndo();
    const newId = 'D' + Date.now();
    window.doors.push({
      id: newId,
      name: `扉 ${window.doors.length + 1}`,
      type: 'single_left',
      width: 1200,
      edgeIndex: 0,
      offsetRatio: 0.5,
      status: 'open'
    });
    window.selectedDoorId = newId;
    syncUI();
    triggerRender();
  }

  function deleteSelectedDoor() {
    if (window.doors.length <= 1) {
      alert('これ以上扉を削除できません。');
      return;
    }
    pushUndo();
    window.doors = window.doors.filter(d => d.id !== window.selectedDoorId);
    window.selectedDoorId = window.doors[0].id;
    syncUI();
    triggerRender();
  }

  function getDoorTransform(door) {
    const pts = window.room.points;
    const n = pts.length;
    const eIdx = (door.edgeIndex >= 0 && door.edgeIndex < n) ? door.edgeIndex : 0;
    const p1 = pts[eIdx];
    const p2 = pts[(eIdx + 1) % n];

    const ratio = Math.max(0.05, Math.min(0.95, door.offsetRatio || 0.5));
    const x = p1.x + (p2.x - p1.x) * ratio;
    const y = p1.y + (p2.y - p1.y) * ratio;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;

    return { x, y, angle, length: Math.hypot(p2.x - p1.x, p2.y - p1.y) };
  }

  function snapDoorToNearestEdge(door, wx, wy) {
    const pts = window.room.points;
    const n = pts.length;
    let bestDist = Infinity;
    let bestEdge = 0;
    let bestRatio = 0.5;

    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) continue;

      let t = ((wx - p1.x) * dx + (wy - p1.y) * dy) / l2;
      t = Math.max(0.05, Math.min(0.95, t));
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const dist = Math.hypot(wx - projX, wy - projY);

      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = i;
        bestRatio = t;
      }
    }
    door.edgeIndex = bestEdge;
    door.offsetRatio = bestRatio;
  }

  // ==========================================================================
  // 6. 描画連動: drawTop(ctx) & drawSide(ctx, sliceX)
  // ==========================================================================
  function drawRoomTop(ctx) {
    const pts = window.room.points;
    if (!pts || pts.length < 3) return;

    ctx.save();

    // 1. 会場床面の塗りつぶし
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    pts.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.fill();

    // 2. 会場外壁ライン
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 60;
    ctx.lineJoin = 'miter';
    ctx.stroke();

    // 3. 多角形頂点ハンドル (多角形モード時)
    if (window.room.shapeType === 'polygon') {
      pts.forEach((pt, i) => {
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 30;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 130px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, pt.x, pt.y);
      });
    }

    // 4. 外周CAD寸法線 (間口W・奥行D)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 15;
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 120px sans-serif';

    // 間口 W (上部寸法)
    ctx.beginPath();
    ctx.moveTo(0, -300); ctx.lineTo(window.room.w, -300);
    ctx.moveTo(0, -450); ctx.lineTo(0, -150);
    ctx.moveTo(window.room.w, -450); ctx.lineTo(window.room.w, -150);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`会場間口 W: ${(window.room.w / 1000).toFixed(2)}m (${window.room.w}mm)`, window.room.w / 2, -350);

    // 奥行 D (左側寸法)
    ctx.beginPath();
    ctx.moveTo(-300, 0); ctx.lineTo(-300, window.room.d);
    ctx.moveTo(-450, 0); ctx.lineTo(-150, 0);
    ctx.moveTo(-450, window.room.d); ctx.lineTo(-150, window.room.d);
    ctx.stroke();
    ctx.save();
    ctx.translate(-350, window.room.d / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`会場奥行 D: ${(window.room.d / 1000).toFixed(2)}m (${window.room.d}mm)`, 0, 0);
    ctx.restore();

    // 5. 扉・搬入口の描画
    window.doors.forEach(d => {
      const tf = getDoorTransform(d);
      const isSel = (d.id === window.selectedDoorId);
      const w = d.width;

      ctx.save();
      ctx.translate(tf.x, tf.y);
      ctx.rotate((tf.angle * Math.PI) / 180);

      ctx.lineWidth = isSel ? 45 : 30;

      if (d.type === 'closed') {
        // 閉鎖 (赤線枠＋×印)
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = '#fee2e2';
        ctx.fillRect(-w / 2, -40, w, 80);
        ctx.strokeRect(-w / 2, -40, w, 80);
        ctx.beginPath();
        ctx.moveTo(-w / 2, -40); ctx.lineTo(w / 2, 40);
        ctx.moveTo(-w / 2, 40); ctx.lineTo(w / 2, -40);
        ctx.stroke();
      } else if (d.type === 'double') {
        // 2枚 (両開き円弧)
        ctx.strokeStyle = isSel ? '#2563eb' : '#0284c7';
        const halfW = w / 2;
        ctx.strokeRect(-halfW, -25, w, 50);
        ctx.beginPath();
        ctx.arc(-halfW, 0, halfW, 0, Math.PI / 2, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(halfW, 0, halfW, Math.PI, Math.PI / 2, true);
        ctx.stroke();
      } else {
        // 片開き (左 / 右)
        ctx.strokeStyle = isSel ? '#2563eb' : '#0284c7';
        ctx.strokeRect(-w / 2, -25, w, 50);
        ctx.beginPath();
        if (d.type === 'single_left') {
          ctx.arc(-w / 2, 0, w, 0, Math.PI / 2, false);
        } else {
          ctx.arc(w / 2, 0, w, Math.PI, Math.PI / 2, true);
        }
        ctx.stroke();
      }

      // 扉名称ラベル
      ctx.fillStyle = isSel ? '#1d4ed8' : '#0f172a';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(d.name, 0, 70);

      ctx.restore();
    });

    ctx.restore();
  }

  function drawRoomSide(ctx, sliceX) {
    ctx.save();

    const ceilingH = window.room.h || 5000;
    const roomD = window.room.d || 24000;

    // 1. 床面基準線 (FL±0: Z=0)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 25;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(roomD, 0);
    ctx.stroke();

    // 2. 天井基準線 (Z = -ceilingH)
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 18;
    ctx.setLineDash([60, 30]);
    ctx.beginPath();
    ctx.moveTo(0, -ceilingH);
    ctx.lineTo(roomD, -ceilingH);
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. 奥壁断面 (Y=0) & 手前壁断面 (Y=roomD)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 30;
    ctx.beginPath();
    // 奥壁 (ステージ背後側)
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -ceilingH);
    // 手前壁 (後方客席・搬入口側)
    ctx.moveTo(roomD, 0);
    ctx.lineTo(roomD, -ceilingH);
    ctx.stroke();

    // 4. 天井高さ CAD寸法線
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 15;
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 120px sans-serif';

    const dimY = -350; // Y=0 のさらに奥に寸法線
    ctx.beginPath();
    ctx.moveTo(dimY, 0); ctx.lineTo(dimY, -ceilingH);
    ctx.moveTo(dimY - 100, 0); ctx.lineTo(dimY + 100, 0);
    ctx.moveTo(dimY - 100, -ceilingH); ctx.lineTo(dimY + 100, -ceilingH);
    ctx.stroke();

    ctx.save();
    ctx.translate(dimY - 80, -ceilingH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`天井高 CH: ${(ceilingH / 1000).toFixed(2)}m (${ceilingH}mm)`, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  // ==========================================================================
  // 7. マウス操作判定 (hitTest & handleDrag)
  // ==========================================================================
  function hitTest(wx, wy) {
    // 1. 多角形頂点ハンドル (半径400mm以内)
    if (window.room.shapeType === 'polygon') {
      const pts = window.room.points;
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(pts[i].x - wx, pts[i].y - wy) < 400) {
          return { type: 'room_vertex', index: i };
        }
      }
    }

    // 2. 扉当たり判定 (600mm以内)
    for (let d of window.doors) {
      const tf = getDoorTransform(d);
      if (Math.hypot(tf.x - wx, tf.y - wy) < 600) {
        window.selectedDoorId = d.id;
        syncSelectedDoorToUI();
        updateDoorSelectOptions();
        triggerRender();
        return { type: 'room_door', item: d };
      }
    }
    return null;
  }

  function handleDrag(target, wx, wy) {
    if (target.type === 'room_vertex') {
      window.room.points[target.index].x = Math.round(wx);
      window.room.points[target.index].y = Math.round(wy);
      recalculateRoomBounds();
      triggerRender();
      return true;
    } else if (target.type === 'room_door') {
      snapDoorToNearestEdge(target.item, wx, wy);
      syncSelectedDoorToUI();
      triggerRender();
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 8. データ入出力 (exportData / importData - Undo/Redo 連動)
  // ==========================================================================
  function exportData() {
    return {
      room: JSON.parse(JSON.stringify(window.room)),
      doors: JSON.parse(JSON.stringify(window.doors)),
      selectedDoorId: window.selectedDoorId
    };
  }

  function importData(data) {
    if (!data) return;
    if (data.room) {
      window.room = JSON.parse(JSON.stringify(data.room));
      if (typeof window.room.h !== 'number') {
        window.room.h = window.room.ceilingH || 5000;
      }
      window.room.ceilingH = window.room.h;
    }
    if (Array.isArray(data.doors)) {
      window.doors = JSON.parse(JSON.stringify(data.doors));
    }
    if (data.selectedDoorId) {
      window.selectedDoorId = data.selectedDoorId;
    }
    syncUI();
  }

  function syncUI() {
    const isPoly = (window.room.shapeType === 'polygon');
    const shapeSel = document.getElementById('roomShapeType');
    if (shapeSel) shapeSel.value = window.room.shapeType;

    const rowRect = document.getElementById('roomBasicDimsRow');
    const grpPoly = document.getElementById('polygonConfigGroup');
    if (rowRect) rowRect.style.display = isPoly ? 'none' : 'grid';
    if (grpPoly) grpPoly.style.display = isPoly ? 'block' : 'none';

    const rw = document.getElementById('roomW');
    const rd = document.getElementById('roomD');
    const rh = document.getElementById('roomH');
    const rhp = document.getElementById('roomHPoly');
    if (rw) rw.value = Math.round(window.room.w);
    if (rd) rd.value = Math.round(window.room.d);
    if (rh) rh.value = Math.round(window.room.h);
    if (rhp) rhp.value = Math.round(window.room.h);

    updateDoorWallSelectOptions();
    updateDoorSelectOptions();
    syncSelectedDoorToUI();
    updateHUDStats();
  }

  function triggerRender() {
    if (typeof window.requestRender === 'function') {
      window.requestRender();
    } else if (typeof window.render === 'function') {
      window.render();
    }
  }

  function pushUndo() {
    if (typeof window.saveHistory === 'function') {
      window.saveHistory();
    }
  }

  // ==========================================================================
  // 9. モジュール登録 & 自動初期化
  // ==========================================================================
  window.tabRoomModule = {
    drawTop: drawRoomTop,
    drawSide: drawRoomSide,
    hitTest: hitTest,
    handleDrag: handleDrag,
    exportData: exportData,
    importData: importData,
    recalculate: recalculateRoomBounds,
    syncUI: syncUI
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectRoomUI);
  } else {
    injectRoomUI();
  }

})();