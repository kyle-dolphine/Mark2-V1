/**
 * tab3_podium.js - 司会台 / 演台 管理モジュール
 * 【EQWEL 会場図面 & ENG視界シミュレーター Mark2 対応】
 * 
 * ・コアエンジン (core_engine.js) との完全連動
 * ・司会台：緑線 (#16a34a)
 * ・演台：オレンジ線 (#ea580c)
 * ・立面図：横軸=Y、縦軸=-Z の統一座標系（ステージ段差・足元完全接地対応）
 * ・独自のカメラ光軸スライス判定を廃止し、Xスライス座標による判定に統一
 */

(function () {
  'use strict';

  // --- 1. データストア ---
  window.simData = window.simData || {};
  
  if (!window.podiums || !Array.isArray(window.podiums) || window.podiums.length === 0) {
    window.podiums = [
      {
        id: 'POD_MC_1',
        type: 'mc',          // 'mc' (司会台: 緑) | 'lecture' (演台: 橙)
        name: '司会台',
        enabled: true,
        w: 900,
        d: 600,
        h: 1100,
        angle: 15,
        x: 3000,
        y: 2200,
        hasHost: true
      }
    ];
  }

  let selectedPodiumId = window.podiums[0].id;

  function getSelected() {
    return window.podiums.find(p => p.id === selectedPodiumId) || window.podiums[0];
  }

  // --- 2. パネル要素の自動検出 & UI構築 ---
  function findOrCreateTargetPanel() {
    const candidateIds = ['panel-podium', 'panel-tab3', 'panel-mc', 'panel-tabPodium'];
    for (const id of candidateIds) {
      const p = document.getElementById(id);
      if (p) return p;
    }

    const allBtns = document.querySelectorAll('.tab-btn');
    for (const btn of allBtns) {
      const text = btn.innerText || '';
      if (text.includes('司会') || text.includes('演台') || btn.id.includes('podium') || btn.id.includes('tab3')) {
        const tabKey = btn.id.replace('tabbtn-', '');
        let target = document.getElementById(`panel-${tabKey}`);
        if (!target) {
          target = document.createElement('div');
          target.id = `panel-${tabKey}`;
          target.className = 'tab-panel';
          const container = document.getElementById('floating-body') || 
                            document.getElementById('floating-ui') || 
                            document.querySelector('.tab-panel')?.parentElement || 
                            document.body;
          container.appendChild(target);
        }
        return target;
      }
    }

    let defaultPanel = document.createElement('div');
    defaultPanel.id = 'panel-podium';
    defaultPanel.className = 'tab-panel';
    const container = document.getElementById('floating-body') || document.body;
    container.appendChild(defaultPanel);
    return defaultPanel;
  }

  function buildUI() {
    const panel = findOrCreateTargetPanel();
    if (!panel) return;

    panel.innerHTML = `
      <div class="ui-group" style="padding:10px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:10px;">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:bold; font-size:12px; color:#0f172a;">🎤 司会台 / 演台 管理</span>
          <div style="display:flex; gap:6px;">
            <button type="button" style="padding:3px 8px; font-size:11px; background:#16a34a; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;" onclick="window.tabPodiumModule.addPodium('mc')">＋ 司会台</button>
            <button type="button" style="padding:3px 8px; font-size:11px; background:#ea580c; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;" onclick="window.tabPodiumModule.addPodium('lecture')">＋ 演台</button>
          </div>
        </div>

        <div style="margin-bottom:8px;">
          <label style="font-size:10px; color:#64748b; font-weight:bold; display:block; margin-bottom:2px;">対象を選択</label>
          <select id="simPodiumSelect" onchange="window.tabPodiumModule.onSelectPodium()" style="width:100%; padding:5px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px; background:#fff; font-weight:bold;"></select>
        </div>

        <div id="simPodiumControls">
          <div style="display:flex; gap:8px; margin-bottom:8px; align-items:flex-end;">
            <div style="flex:2;">
              <label style="font-size:10px; color:#64748b; font-weight:bold; display:block; margin-bottom:2px;">名称 (表示名)</label>
              <input type="text" id="simPodiumName" oninput="window.tabPodiumModule.updateParams()" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;">
            </div>
            <div style="flex:1; padding-bottom:4px;">
              <label style="cursor:pointer; font-size:12px; font-weight:bold; display:flex; align-items:center; gap:4px; color:#0f172a;">
                <input type="checkbox" id="simPodiumEnabled" onchange="window.tabPodiumModule.updateParams()"> 有効
              </label>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; margin-bottom:8px;">
            <div><label style="font-size:10px; color:#64748b;">幅(W) mm</label><input type="number" id="simPodiumW" step="50" onchange="window.tabPodiumModule.updateParams()" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
            <div><label style="font-size:10px; color:#64748b;">奥行(D) mm</label><input type="number" id="simPodiumD" step="50" onchange="window.tabPodiumModule.updateParams()" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
            <div><label style="font-size:10px; color:#64748b;">高さ(H) mm</label><input type="number" id="simPodiumH" step="50" onchange="window.tabPodiumModule.updateParams()" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
            <div><label style="font-size:10px; color:#64748b;">角度(°)</label><input type="number" id="simPodiumAngle" step="5" onchange="window.tabPodiumModule.updateParams()" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
            <div><label style="font-size:10px; color:#64748b;">位置X mm</label><input type="number" id="simPodiumX" step="100" onchange="window.tabPodiumModule.updateParams()" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
            <div><label style="font-size:10px; color:#64748b;">位置Y mm</label><input type="number" id="simPodiumY" step="100" onchange="window.tabPodiumModule.updateParams()" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px solid #e2e8f0;">
            <label style="font-size:11px; font-weight:bold; display:flex; align-items:center; gap:5px; cursor:pointer;" id="simPodiumHostWrap">
              <input type="checkbox" id="simPodiumHost" onchange="window.tabPodiumModule.updateParams()">
              <span id="simPodiumHostLabel">人物 (パーソン) を配置する</span>
            </label>
            <button type="button" style="padding:3px 8px; font-size:11px; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="window.tabPodiumModule.deletePodium()">削除</button>
          </div>
        </div>
      </div>
    `;

    syncUI();
  }

  function syncUI() {
    const sel = document.getElementById('simPodiumSelect');
    if (!sel) return;

    sel.innerHTML = '';
    window.podiums.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      const isLec = p.type === 'lecture';
      const mark = isLec ? '📙 [演台]' : '🎤 [司会]';
      opt.textContent = `${mark} ${p.name}` + (!p.enabled ? ' (無効)' : '');
      sel.appendChild(opt);
    });

    if (!window.podiums.some(p => p.id === selectedPodiumId) && window.podiums.length > 0) {
      selectedPodiumId = window.podiums[0].id;
    }
    sel.value = selectedPodiumId;

    const cur = getSelected();
    const ctrlArea = document.getElementById('simPodiumControls');
    if (!cur) {
      if (ctrlArea) ctrlArea.style.display = 'none';
      return;
    }
    if (ctrlArea) ctrlArea.style.display = 'block';

    document.getElementById('simPodiumName').value = cur.name || '';
    document.getElementById('simPodiumEnabled').checked = !!cur.enabled;
    document.getElementById('simPodiumW').value = cur.w;
    document.getElementById('simPodiumD').value = cur.d;
    document.getElementById('simPodiumH').value = cur.h;
    document.getElementById('simPodiumAngle').value = cur.angle;
    document.getElementById('simPodiumX').value = cur.x;
    document.getElementById('simPodiumY').value = cur.y;
    document.getElementById('simPodiumHost').checked = !!cur.hasHost;

    const hostLabel = document.getElementById('simPodiumHostLabel');
    const hostWrap = document.getElementById('simPodiumHostWrap');
    if (hostLabel && hostWrap) {
      const isLec = cur.type === 'lecture';
      hostLabel.innerText = isLec ? '登壇者 (パーソン) を配置する' : '司会者 (パーソン) を配置する';
      hostWrap.style.color = isLec ? '#ea580c' : '#16a34a';
    }
  }

  // --- 3. アクション操作 ---
  function onSelectPodium() {
    const sel = document.getElementById('simPodiumSelect');
    if (sel) {
      selectedPodiumId = sel.value;
      syncUI();
      if (typeof window.requestRender === 'function') window.requestRender();
    }
  }

  function addPodium(type) {
    if (typeof window.saveHistory === 'function') window.saveHistory();

    const isLec = type === 'lecture';
    const count = window.podiums.filter(p => p.type === type).length + 1;
    const newId = (isLec ? 'POD_LEC_' : 'POD_MC_') + Date.now();
    const stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000 };

    const newObj = {
      id: newId,
      type: type,
      name: isLec ? `演台 ${count}` : `司会台 ${count}`,
      enabled: true,
      w: isLec ? 1000 : 900,
      d: isLec ? 650 : 600,
      h: 1100,
      angle: isLec ? -10 : 15,
      x: isLec ? (stage.x + stage.w - 1500) : (stage.x + 1000),
      y: (stage.y + stage.d - 600),
      hasHost: true
    };

    window.podiums.push(newObj);
    selectedPodiumId = newId;
    syncUI();
    if (typeof window.requestRender === 'function') window.requestRender();
  }

  function deletePodium() {
    if (window.podiums.length <= 1) {
      alert('最低1台必要です。非表示にする場合は「有効」のチェックを外してください。');
      return;
    }
    if (typeof window.saveHistory === 'function') window.saveHistory();

    window.podiums = window.podiums.filter(p => p.id !== selectedPodiumId);
    selectedPodiumId = window.podiums[0].id;
    syncUI();
    if (typeof window.requestRender === 'function') window.requestRender();
  }

  function updateParams() {
    const cur = getSelected();
    if (!cur) return;
    if (typeof window.saveHistory === 'function') window.saveHistory();

    cur.name = document.getElementById('simPodiumName').value;
    cur.enabled = document.getElementById('simPodiumEnabled').checked;
    cur.w = parseFloat(document.getElementById('simPodiumW').value) || 900;
    cur.d = parseFloat(document.getElementById('simPodiumD').value) || 600;
    cur.h = parseFloat(document.getElementById('simPodiumH').value) || 1100;
    cur.angle = parseFloat(document.getElementById('simPodiumAngle').value) || 0;
    cur.x = parseFloat(document.getElementById('simPodiumX').value) || 0;
    cur.y = parseFloat(document.getElementById('simPodiumY').value) || 0;
    cur.hasHost = document.getElementById('simPodiumHost').checked;

    const sel = document.getElementById('simPodiumSelect');
    if (sel) {
      const opt = sel.querySelector(`option[value="${cur.id}"]`);
      if (opt) {
        const mark = cur.type === 'lecture' ? '📙 [演台]' : '🎤 [司会]';
        opt.textContent = `${mark} ${cur.name}` + (!cur.enabled ? ' (無効)' : '');
      }
    }

    if (typeof window.requestRender === 'function') window.requestRender();
  }

  // --- 4. コアエンジン連動 (描画・判定・データ入出力) ---
  
  function drawTop(tCtx) {
    window.podiums.forEach(p => {
      if (!p.enabled) return;

      const isSel = (p.id === selectedPodiumId);
      const color = (p.type === 'lecture') ? '#ea580c' : '#16a34a';
      const drawColor = isSel ? '#2563eb' : color;

      tCtx.save();
      tCtx.translate(p.x, p.y);
      tCtx.rotate((p.angle || 0) * Math.PI / 180);

      tCtx.strokeStyle = drawColor;
      tCtx.lineWidth = isSel ? 55 : 35;
      tCtx.strokeRect(-p.w / 2, -p.d / 2, p.w, p.d);

      tCtx.fillStyle = drawColor;
      tCtx.font = 'bold 150px sans-serif';
      tCtx.textAlign = 'center';
      tCtx.textBaseline = 'middle';
      if (typeof window.drawOutlinedText === 'function') {
        window.drawOutlinedText(tCtx, p.name, 0, 0, 30);
      } else {
        tCtx.fillText(p.name, 0, 0);
      }

      if (p.hasHost) {
        const headY = -p.d / 2 - 200;
        tCtx.beginPath();
        tCtx.arc(0, headY, 180, 0, Math.PI * 2);
        tCtx.strokeStyle = drawColor;
        tCtx.lineWidth = 30;
        tCtx.stroke();

        tCtx.fillStyle = drawColor;
        tCtx.font = 'bold 130px sans-serif';
        const roleText = (p.type === 'lecture') ? '登壇' : '司会';
        if (typeof window.drawOutlinedText === 'function') {
          window.drawOutlinedText(tCtx, roleText, 0, headY - 240, 25);
        } else {
          tCtx.fillText(roleText, 0, headY - 240);
        }
      }
      tCtx.restore();
    });
  }

  function drawSide(tCtx, sliceX) {
    const stage = window.stage || { x: 0, y: 0, w: 0, d: 0, h: 0 };

    window.podiums.forEach(p => {
      if (!p.enabled) return;

      // 独自の「カメラ光軸スライス判定」を廃止し、Xスライス座標による判定に統一
      // （※ sliceX が渡されている場合は、描画対象がスライス範囲内にあるか判定）
      if (typeof sliceX === 'number') {
        const boundRadius = Math.max(p.w, p.d) / 2 + 500; // 余裕を持たせた判定幅
        if (Math.abs(p.x - sliceX) > boundRadius) {
          return;
        }
      }

      const isSel = (p.id === selectedPodiumId);
      const color = (p.type === 'lecture') ? '#ea580c' : '#16a34a';
      const drawColor = isSel ? '#2563eb' : color;
      
      // ステージ上判定（isInsideStage）に基づく底面高（baseZ）
      const baseZ = (typeof window.isInsideStage === 'function' && window.isInsideStage(p.x, p.y)) ? stage.h : 0;

      tCtx.save();
      tCtx.strokeStyle = drawColor;
      tCtx.lineWidth = 30;
      
      // 立面矩形の描画（横軸=Y, 縦軸=-Z）
      // 床面 baseZ に接地させるため -baseZ - p.h の位置から p.h の高さを描画
      tCtx.strokeRect(p.y - p.d / 2, -baseZ - p.h, p.d, p.h);

      // パーソン立面シルエット（底面高 baseZ に正しく接地）
      if (p.hasHost) {
        tCtx.fillStyle = drawColor;
        if (typeof window.drawPersonSilhouette === 'function') {
          window.drawPersonSilhouette(tCtx, p.y - p.d / 2 - 120, baseZ, 1600, false, 1);
        } else {
          // フォールバック: 丸と長方形で人を描く
          tCtx.beginPath();
          tCtx.arc(p.y - p.d / 2 - 120, -baseZ - 1450, 150, 0, Math.PI * 2);
          tCtx.fill();
          tCtx.fillRect(p.y - p.d / 2 - 200, -baseZ - 1300, 160, 1300);
        }
      }

      // 名称テキスト
      tCtx.fillStyle = drawColor;
      tCtx.font = 'bold 180px sans-serif';
      tCtx.textAlign = 'center';
      if (typeof window.drawOutlinedText === 'function') {
        window.drawOutlinedText(tCtx, p.name, p.y, -baseZ - p.h - 120);
      } else {
        tCtx.fillText(p.name, p.y, -baseZ - p.h - 120);
      }
      tCtx.restore();
    });
  }

  function hitTest(wx, wy) {
    for (let p of window.podiums) {
      if (!p.enabled) continue;
      const dist = Math.hypot(p.x - wx, p.y - wy);
      if (dist < Math.max(p.w, p.d) / 2 + 150) {
        selectedPodiumId = p.id;
        syncUI();
        return { type: 'podium', id: p.id };
      }
    }
    return null;
  }

  function handleDrag(target, wx, wy) {
    if (!target || target.type !== 'podium') return false;
    const p = window.podiums.find(item => item.id === target.id);
    if (p) {
      p.x = Math.round(wx);
      p.y = Math.round(wy);
      const xEl = document.getElementById('simPodiumX');
      const yEl = document.getElementById('simPodiumY');
      if (xEl) xEl.value = p.x;
      if (yEl) yEl.value = p.y;
      return true;
    }
    return false;
  }

  function exportData() {
    return {
      podiums: JSON.parse(JSON.stringify(window.podiums)),
      selectedPodiumId: selectedPodiumId
    };
  }

  function importData(data) {
    if (!data) return;
    if (Array.isArray(data.podiums)) {
      window.podiums = data.podiums;
    }
    if (data.selectedPodiumId) {
      selectedPodiumId = data.selectedPodiumId;
    }
    syncUI();
  }

  // --- 5. モジュール公開 & 初期化 ---
  window.tabPodiumModule = {
    drawTop,
    drawSide,
    hitTest,
    handleDrag,
    exportData,
    importData,
    addPodium,
    deletePodium,
    updateParams,
    onSelectPodium,
    buildUI,
    syncUI
  };

  function setup() {
    buildUI();
    // UIが空になった場合に備えて、タブボタンクリック時に自己修復するイベント
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = findOrCreateTargetPanel();
        if (panel && (!panel.innerHTML || panel.innerHTML.trim() === '')) {
          buildUI();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();