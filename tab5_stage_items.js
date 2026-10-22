/**
 * ============================================================================
 * ENG Sightline & Stage Simulator Mark2
 * モジュール：【タブ5：舞台什器】 tab5_stage_items.js
 * 
 * 担当機能：
 *  1. 舞台什器管理（机 / 椅子 / 展示台、0個対応）
 *  2. 設置基準面（baseType: auto / floor / stage）による立面図の接地追従
 *  3. 立面図（Side View）統一座標系（横軸=Y, 縦軸=-baseZ - H）と sliceX 断面判定
 *  4. コアAPI（drawTop, drawSide, hitTest, handleDrag, exportData, importData）
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. データモデル初期化 (0個許容)
  // ==========================================================================
  window.stageItems = window.stageItems || [
    { id: 'SI1', name: 'サイドテーブル', category: 'table', shape: 'rect', chairType: 'high', baseType: 'auto', w: 900, d: 450, h: 700, angle: 0, x: 4000, y: 2200 },
    { id: 'SI2', name: 'カフェ丸テーブル', category: 'table', shape: 'circle', chairType: 'high', baseType: 'auto', w: 600, d: 600, h: 700, angle: 0, x: 5500, y: 2200 },
    { id: 'SI3', name: 'ハイチェア', category: 'chair', shape: 'rect', chairType: 'high', baseType: 'auto', w: 450, d: 450, h: 750, angle: 0, x: 6500, y: 2200 },
    { id: 'SI4', name: '円柱展示台', category: 'display', shape: 'circle', chairType: 'high', baseType: 'floor', w: 600, d: 600, h: 900, angle: 0, x: 7500, y: 2000 }
  ];
  window.selectedStageItemId = window.selectedStageItemId || (window.stageItems.length > 0 ? window.stageItems[0].id : null);

  // ==========================================================================
  // 2. UIテンプレート生成 & 注入
  // ==========================================================================
  function injectStageItemsUI() {
    const container = document.getElementById('panel-stage_items') || 
                      document.getElementById('panel-stageitems') || 
                      document.getElementById('panel-tab5');
    if (!container) return;

    container.innerHTML = `
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>🛋️ 舞台什器 (机 / 椅子 / 展示台)</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-action" id="btnAddStageItem" style="padding:2px 6px; font-size:10px;">＋ 追加</button>
            <button class="btn-action btn-danger" id="btnDelStageItem" style="padding:2px 6px; font-size:10px;">削除</button>
          </div>
        </div>
        <div class="ui-row full">
          <div class="input-box">
            <label>選択什器</label>
            <select id="stageItemSelect"></select>
          </div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>名称</label><input type="text" id="siName"></div>
          <div class="input-box">
            <label>種類</label>
            <select id="siCategory">
              <option value="table">テーブル</option>
              <option value="chair">椅子</option>
              <option value="display">展示台</option>
            </select>
          </div>
        </div>
        <div class="ui-row">
          <div class="input-box">
            <label id="siTypeLabel">形状</label>
            <select id="siShape">
              <option value="rect">四角形</option>
              <option value="circle">円形 / 円柱</option>
            </select>
            <select id="siChairType" style="display:none;">
              <option value="high">ハイチェア</option>
              <option value="low">ローチェア</option>
            </select>
          </div>
          <div class="input-box"><label>角度 (°)</label><input type="number" id="siAngle" step="5"></div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label id="siWLabel">幅 W (mm)</label><input type="number" id="siW" step="50"></div>
          <div class="input-box"><label id="siDLabel">奥行 D (mm)</label><input type="number" id="siD" step="50"></div>
          <div class="input-box"><label>高さ H (mm)</label><input type="number" id="siH" step="50"></div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>配置 X (mm)</label><input type="number" id="siX" step="100"></div>
          <div class="input-box"><label>配置 Y (mm)</label><input type="number" id="siY" step="100"></div>
          <div class="input-box">
            <label>設置基準面</label>
            <select id="siBaseType" style="font-weight:bold;">
              <option value="auto">自動 (座標判定)</option>
              <option value="floor">🟩 床面 (FL±0)</option>
              <option value="stage">🏛️ ステージ上</option>
            </select>
          </div>
        </div>
      </div>
    `;

    bindStageItemsEvents();
    updateUIList();
  }

  // ==========================================================================
  // 3. UIイベントリスナー
  // ==========================================================================
  function bindStageItemsEvents() {
    document.getElementById('btnAddStageItem').addEventListener('click', function() {
      pushUndo();
      const num = window.stageItems.length + 1;
      const newId = 'SI' + Date.now();
      const st = window.stage || { x: 3000, y: 1500, w: 8000, d: 3000 };
      
      window.stageItems.push({
        id: newId,
        name: `什器 ${num}`,
        category: 'table',
        shape: 'rect',
        chairType: 'high',
        baseType: 'auto',
        w: 900,
        d: 600,
        h: 700,
        angle: 0,
        x: Math.round(st.x + st.w / 2),
        y: Math.round(st.y + st.d / 2)
      });
      window.selectedStageItemId = newId;
      updateUIList();
      triggerRender();
    });

    document.getElementById('btnDelStageItem').addEventListener('click', function() {
      if (!window.stageItems || window.stageItems.length === 0) return;
      pushUndo();
      window.stageItems = window.stageItems.filter(item => item.id !== window.selectedStageItemId);
      window.selectedStageItemId = window.stageItems.length > 0 ? window.stageItems[0].id : null;
      updateUIList();
      triggerRender();
    });

    document.getElementById('stageItemSelect').addEventListener('change', function(e) {
      window.selectedStageItemId = e.target.value;
      syncUI();
      triggerRender();
    });

    document.getElementById('siCategory').addEventListener('change', function(e) {
      const isChair = e.target.value === 'chair';
      document.getElementById('siShape').style.display = isChair ? 'none' : 'inline-block';
      document.getElementById('siChairType').style.display = isChair ? 'inline-block' : 'none';
      document.getElementById('siTypeLabel').textContent = isChair ? 'タイプ' : '形状';
      onParamChange();
    });

    const onParamChange = function() {
      const item = window.stageItems.find(it => it.id === window.selectedStageItemId);
      if (!item) return;
      pushUndo();

      item.name = document.getElementById('siName').value || '什器';
      item.category = document.getElementById('siCategory').value;
      item.shape = document.getElementById('siShape').value;
      item.chairType = document.getElementById('siChairType').value;
      item.baseType = document.getElementById('siBaseType').value || 'auto';

      item.w = parseFloat(document.getElementById('siW').value) || 450;
      if (item.category !== 'chair' && item.shape === 'circle') {
        item.d = item.w;
      } else {
        item.d = parseFloat(document.getElementById('siD').value) || 450;
      }

      item.h = parseFloat(document.getElementById('siH').value) || 700;
      item.angle = parseFloat(document.getElementById('siAngle').value) || 0;
      item.x = parseFloat(document.getElementById('siX').value) || 0;
      item.y = parseFloat(document.getElementById('siY').value) || 0;

      syncUI();
      updateUIList();
      triggerRender();
    };

    ['siName', 'siShape', 'siChairType', 'siBaseType', 'siW', 'siD', 'siH', 'siAngle', 'siX', 'siY']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', onParamChange);
      });
  }

  // ==========================================================================
  // 4. データ・UI 同期処理 (0個対応)
  // ==========================================================================
  function updateUIList() {
    const sel = document.getElementById('stageItemSelect');
    if (!sel) return;
    sel.innerHTML = '';

    if (!window.stageItems || window.stageItems.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '※ 什器がありません (0個)';
      sel.appendChild(opt);
      sel.disabled = true;
    } else {
      sel.disabled = false;
      window.stageItems.forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.id;
        let catLabel = '机';
        if (it.category === 'chair') catLabel = '椅子';
        if (it.category === 'display') catLabel = '展示台';
        opt.textContent = `[${catLabel}] ${it.name}`;
        sel.appendChild(opt);
      });
      sel.value = window.selectedStageItemId;
    }
    syncUI();
  }

  function syncUI() {
    const item = window.stageItems ? window.stageItems.find(it => it.id === window.selectedStageItemId) : null;
    const formFields = ['siName', 'siCategory', 'siShape', 'siChairType', 'siBaseType', 'siW', 'siD', 'siH', 'siAngle', 'siX', 'siY'];

    if (!item) {
      formFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ''; el.disabled = true; }
      });
      return;
    }

    formFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });

    document.getElementById('siName').value = item.name;
    document.getElementById('siCategory').value = item.category;
    document.getElementById('siShape').value = item.shape || 'rect';
    document.getElementById('siChairType').value = item.chairType || 'high';
    document.getElementById('siBaseType').value = item.baseType || 'auto';
    document.getElementById('siW').value = item.w;
    document.getElementById('siD').value = item.d;
    document.getElementById('siH').value = item.h;
    document.getElementById('siAngle').value = item.angle || 0;
    document.getElementById('siX').value = Math.round(item.x);
    document.getElementById('siY').value = Math.round(item.y);

    const isChair = item.category === 'chair';
    document.getElementById('siShape').style.display = isChair ? 'none' : 'inline-block';
    document.getElementById('siChairType').style.display = isChair ? 'inline-block' : 'none';
    document.getElementById('siTypeLabel').textContent = isChair ? 'タイプ' : '形状';

    if (!isChair && item.shape === 'circle') {
      document.getElementById('siWLabel').textContent = '直径 (mm)';
      document.getElementById('siDLabel').textContent = '奥行 (固定)';
      document.getElementById('siD').disabled = true;
      document.getElementById('siD').value = item.w;
    } else {
      document.getElementById('siWLabel').textContent = '幅 W (mm)';
      document.getElementById('siDLabel').textContent = '奥行 D (mm)';
      document.getElementById('siD').disabled = false;
    }
  }

  // ==========================================================================
  // 5. 描画エンジン連動 (Top / Side)
  // ==========================================================================
  function drawStageItemsTop(ctx) {
    if (!window.stageItems || window.stageItems.length === 0) return;

    window.stageItems.forEach(it => {
      const isSel = (it.id === window.selectedStageItemId);
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate((it.angle || 0) * Math.PI / 180);

      let strokeColor = '#475569';
      let fillColor = '#f8fafc';

      if (it.category === 'table') {
        strokeColor = isSel ? '#2563eb' : '#0284c7';
        fillColor = isSel ? '#e0f2fe' : '#ffffff';
      } else if (it.category === 'chair') {
        strokeColor = isSel ? '#dc2626' : '#ea580c';
        fillColor = isSel ? '#fee2e2' : '#ffffff';
      } else if (it.category === 'display') {
        strokeColor = isSel ? '#7c3aed' : '#9333ea';
        fillColor = isSel ? '#f3e8ff' : '#ffffff';
      }

      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = isSel ? 30 : 18;

      if (it.category === 'chair') {
        ctx.fillRect(-it.w / 2, -it.d / 2, it.w, it.d);
        ctx.strokeRect(-it.w / 2, -it.d / 2, it.w, it.d);
        ctx.fillStyle = strokeColor;
        ctx.fillRect(-it.w / 2, -it.d / 2, it.w, 60);
      } else if (it.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, it.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (it.category === 'display') {
          ctx.beginPath();
          ctx.arc(0, 0, it.w / 2 - 30, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.fillRect(-it.w / 2, -it.d / 2, it.w, it.d);
        ctx.strokeRect(-it.w / 2, -it.d / 2, it.w, it.d);
        if (it.category === 'display') {
          ctx.strokeRect(-it.w / 2 + 30, -it.d / 2 + 30, it.w - 60, it.d - 60);
        }
      }

      ctx.fillStyle = strokeColor;
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let label = it.name;
      if (it.category === 'chair') label += (it.chairType === 'high' ? '(H)' : '(L)');

      ctx.lineWidth = 14;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(label, 0, 0);
      ctx.fillText(label, 0, 0);

      ctx.restore();
    });
  }

  function drawStageItemsSide(ctx, sliceX) {
    if (!window.stageItems || window.stageItems.length === 0) return;

    window.stageItems.forEach(it => {
      const itD = (it.category !== 'chair' && it.shape === 'circle') ? it.w : (it.d || 450);
      const itH = it.h || 700;

      // sliceX 指定時は奥行き(D/2)および半幅に準拠して断面判定
      if (sliceX !== undefined && sliceX !== null && typeof sliceX === 'number' && !isNaN(sliceX)) {
        const boundTolerance = Math.max(it.w / 2, itD / 2);
        if (Math.abs(sliceX - it.x) > boundTolerance) {
          return;
        }
      }

      ctx.save();
      const isSel = (it.id === window.selectedStageItemId);

      // 設置基準面（baseType）に基づく底面高（baseZ）の決定
      let baseZ = 0;
      if (it.baseType === 'floor') {
        baseZ = 0;
      } else if (it.baseType === 'stage') {
        baseZ = (window.stage && window.stage.h) ? window.stage.h : 800;
      } else {
        // auto（自動判定）
        if (typeof window.isInsideStage === 'function') {
          baseZ = window.isInsideStage(it.x, it.y) ? ((window.stage && window.stage.h) || 800) : 0;
        } else if (window.stage) {
          const st = window.stage;
          if (it.x >= st.x && it.x <= st.x + st.w && it.y >= st.y && it.y <= st.y + st.d) {
            baseZ = st.h || 0;
          }
        }
      }

      ctx.lineWidth = isSel ? 28 : 18;

      if (it.category === 'table') {
        ctx.fillStyle = isSel ? '#e0f2fe' : '#ffffff';
        ctx.strokeStyle = isSel ? '#2563eb' : '#0284c7';
        // テーブル天板
        ctx.fillRect(it.y - itD / 2, -baseZ - itH, itD, 50);
        ctx.strokeRect(it.y - itD / 2, -baseZ - itH, itD, 50);
        // テーブル脚
        ctx.beginPath();
        ctx.moveTo(it.y - itD / 2 + 30, -baseZ - itH + 50); ctx.lineTo(it.y - itD / 2 + 30, -baseZ);
        ctx.moveTo(it.y + itD / 2 - 30, -baseZ - itH + 50); ctx.lineTo(it.y + itD / 2 - 30, -baseZ);
        ctx.stroke();

      } else if (it.category === 'chair') {
        ctx.fillStyle = isSel ? '#fee2e2' : '#ffffff';
        ctx.strokeStyle = isSel ? '#dc2626' : '#ea580c';
        // 椅子の座面
        ctx.fillRect(it.y - itD / 2, -baseZ - itH, itD, 40);
        ctx.strokeRect(it.y - itD / 2, -baseZ - itH, itD, 40);
        // 椅子の脚
        ctx.beginPath();
        ctx.moveTo(it.y - itD / 2 + 25, -baseZ - itH + 40); ctx.lineTo(it.y - itD / 2 + 25, -baseZ);
        ctx.moveTo(it.y + itD / 2 - 25, -baseZ - itH + 40); ctx.lineTo(it.y + itD / 2 - 25, -baseZ);
        ctx.stroke();
        // ハイチェアのステップ
        if (it.chairType === 'high') {
          ctx.beginPath();
          ctx.moveTo(it.y - itD / 2 + 25, -baseZ - 250);
          ctx.lineTo(it.y + itD / 2 - 25, -baseZ - 250);
          ctx.stroke();
        }
        // 椅子の背もたれ
        const backH = (it.chairType === 'high') ? 220 : 320;
        ctx.fillRect(it.y - itD / 2, -baseZ - itH - backH, 25, backH);
        ctx.strokeRect(it.y - itD / 2, -baseZ - itH - backH, 25, backH);

      } else if (it.category === 'display') {
        ctx.fillStyle = isSel ? '#f3e8ff' : '#ffffff';
        ctx.strokeStyle = isSel ? '#7c3aed' : '#9333ea';
        // 展示台ブロック
        ctx.fillRect(it.y - itD / 2, -baseZ - itH, itD, itH);
        ctx.strokeRect(it.y - itD / 2, -baseZ - itH, itD, itH);
      }

      // 高さ表記
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 110px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${it.name} (H:${itH})`, it.y, -baseZ - itH - 60);

      ctx.restore();
    });
  }

  // ==========================================================================
  // 6. クリック判定 & ドラッグハンドラ
  // ==========================================================================
  function hitTest(wx, wy) {
    if (!window.stageItems || window.stageItems.length === 0) return null;

    for (let i = window.stageItems.length - 1; i >= 0; i--) {
      const it = window.stageItems[i];
      const dx = wx - it.x;
      const dy = wy - it.y;
      const rad = -(it.angle || 0) * Math.PI / 180;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

      const itD = (it.category !== 'chair' && it.shape === 'circle') ? it.w : (it.d || 450);
      let hit = false;

      if (it.category !== 'chair' && it.shape === 'circle') {
        if (Math.hypot(rx, ry) <= it.w / 2) hit = true;
      } else {
        if (Math.abs(rx) <= it.w / 2 && Math.abs(ry) <= itD / 2) hit = true;
      }

      if (hit) {
        window.selectedStageItemId = it.id;
        syncUI();
        triggerRender();
        return { type: 'stage_item', item: it, offsetX: it.x - wx, offsetY: it.y - wy };
      }
    }
    return null;
  }

  function handleDrag(target, wx, wy) {
    if (target && target.type === 'stage_item') {
      target.item.x = Math.round(wx + target.offsetX);
      target.item.y = Math.round(wy + target.offsetY);
      syncUI();
      triggerRender();
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 7. エクスポート & インポート (Undo/Redo & JSON保存対応)
  // ==========================================================================
  function exportData() {
    return {
      stageItems: JSON.parse(JSON.stringify(window.stageItems || [])),
      selectedStageItemId: window.selectedStageItemId
    };
  }

  function importData(data) {
    if (!data) return;
    if (Array.isArray(data)) {
      window.stageItems = JSON.parse(JSON.stringify(data));
      window.selectedStageItemId = window.stageItems.length > 0 ? window.stageItems[0].id : null;
    } else if (data.stageItems && Array.isArray(data.stageItems)) {
      window.stageItems = JSON.parse(JSON.stringify(data.stageItems));
      window.selectedStageItemId = data.selectedStageItemId || (window.stageItems.length > 0 ? window.stageItems[0].id : null);
    }
    updateUIList();
    triggerRender();
  }

  // ==========================================================================
  // 8. 共通ユーティリティ連動
  // ==========================================================================
  function triggerRender() {
    if (typeof window.requestRender === 'function') window.requestRender();
    else if (typeof window.render === 'function') window.render();
  }

  function pushUndo() {
    if (typeof window.saveHistory === 'function') window.saveHistory();
  }

  // ==========================================================================
  // 9. コアAPI公開 & 自動初期化
  // ==========================================================================
  window.tabStageItemsModule = {
    drawTop: drawStageItemsTop,
    drawSide: drawStageItemsSide,
    hitTest: hitTest,
    handleDrag: handleDrag,
    exportData: exportData,
    importData: importData,
    syncUI: updateUIList
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStageItemsUI);
  } else {
    injectStageItemsUI();
  }
})();