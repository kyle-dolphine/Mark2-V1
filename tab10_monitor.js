/**
 * ==============================================================================
 * EQWEL 会場図面 & ENG視界シミュレーター Mark2
 * 【拡張モジュール】 モニター設定 (tab10_monitor.js)
 * 
 * 演出用（客席向け）とステージ用（返し・登壇者向け）の配置管理、
 * スタンド種類（ロー、標準、ハイ）の選択、24〜100インチまでの寸法管理、
 * 視認シミュレーション（視野角コーン＆テキストログ出力）を提供します。
 * ==============================================================================
 */

window.tabMonitorModule = (function() {
  let monitors = [];
  let selectedId = null;

  // スタンド種別定義 (Zは画面中心の基準高さ mm)
  const STAND_TYPES = {
    'low': { name: 'ロースタンド', defaultZ: 500, tilt: 30, baseD: 700 }, // 上向きチルト
    'normal': { name: 'スタンド', defaultZ: 1400, tilt: 0, baseD: 900 },
    'high': { name: 'ハイスタンド', defaultZ: 1900, tilt: 0, baseD: 1000 }
  };

  // モニターインチ寸法 (W × H mm)
  const SIZE_MAP = {
    '24': { w: 530, h: 300 },
    '32': { w: 710, h: 400 },
    '43': { w: 970, h: 560 },
    '50': { w: 1110, h: 625 },
    '55': { w: 1220, h: 690 },
    '65': { w: 1440, h: 810 },
    '75': { w: 1660, h: 935 },
    '86': { w: 1930, h: 1090 },
    '100': { w: 2210, h: 1250 }
  };

  function findOrCreateTargetPanel() {
    // 候補となるパネルID
    const candidateIds = ['panel-monitor', 'panel-tab10', 'panel-tabMonitor'];
    for (const id of candidateIds) {
      const p = document.getElementById(id);
      if (p) return p;
    }

    // HTML上のタブボタンからIDを逆引き
    const allBtns = document.querySelectorAll('.tab-btn');
    for (const btn of allBtns) {
      const text = btn.innerText || '';
      if (text.includes('モニター') || btn.id.includes('monitor') || btn.id.includes('tab10')) {
        const tabKey = btn.id.replace('tabbtn-', '');
        let target = document.getElementById(`panel-${tabKey}`);
        if (!target) {
          target = document.createElement('div');
          target.id = `panel-${tabKey}`;
          target.className = 'tab-panel';
          const container = document.getElementById('floating-body') || 
                            document.getElementById('tab-content-container') || 
                            document.body;
          container.appendChild(target);
        }
        return target;
      }
    }

    // いずれも見つからない場合の保険
    let defaultPanel = document.createElement('div');
    defaultPanel.id = 'panel-monitor';
    defaultPanel.className = 'tab-panel';
    const container = document.getElementById('floating-body') || 
                      document.getElementById('tab-content-container') || 
                      document.body;
    container.appendChild(defaultPanel);
    return defaultPanel;
  }

  function initUI() {
    const panel = findOrCreateTargetPanel();
    if (!panel) return;
    
    panel.innerHTML = `
      <div class="ui-group" style="padding:10px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:10px;">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-weight:bold; font-size:12px; color:#0f172a;">📺 モニター・映像管理</span>
          <button type="button" class="btn-action" style="padding:3px 8px; font-size:11px; background:#3b82f6; color:#fff; border:none; border-radius:4px; cursor:pointer; font-weight:bold;" id="mon-add-btn">＋ 追加</button>
        </div>
        <div style="margin-bottom:8px;">
          <label style="font-size:10px; color:#64748b; font-weight:bold; display:block; margin-bottom:2px;">選択機器</label>
          <select id="monSelect" style="width:100%; padding:5px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px; background:#fff; font-weight:bold;"></select>
        </div>
        <div id="monControls">
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <div style="flex:1;">
              <label style="font-size:10px; color:#64748b; font-weight:bold; display:block; margin-bottom:2px;">用途・向き</label>
              <select id="monTarget" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
                <option value="guest">登壇者向け (返しモニター)</option>
                <option value="audience">客席向け (演出モニター)</option>
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:#64748b; font-weight:bold; display:block; margin-bottom:2px;">スタンド種別</label>
              <select id="monStand" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
                <option value="low">ロースタンド (チルト上向き)</option>
                <option value="normal">スタンド (自立)</option>
                <option value="high">ハイスタンド (高所)</option>
              </select>
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <div style="flex:1;">
              <label style="font-size:10px; color:#64748b; font-weight:bold; display:block; margin-bottom:2px;">画面サイズ</label>
              <select id="monSize" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
                <option value="24">24インチ (W530×H300)</option>
                <option value="32">32インチ (W710×H400)</option>
                <option value="43">43インチ (W970×H560)</option>
                <option value="50">50インチ (W1110×H625)</option>
                <option value="55">55インチ (W1220×H690)</option>
                <option value="65">65インチ (W1440×H810)</option>
                <option value="75">75インチ (W1660×H935)</option>
                <option value="86">86インチ (W1930×H1090)</option>
                <option value="100">100インチ (W2210×H1250)</option>
              </select>
            </div>
            <div style="flex:1;">
              <label style="font-size:10px; color:#2563eb; font-weight:bold; display:block; margin-bottom:2px;">首振り (左右角度°)</label>
              <input type="number" id="monPan" value="0" step="5" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-bottom:8px;">
            <div style="flex:2;">
              <label style="font-size:10px; color:#64748b; font-weight:bold; display:block; margin-bottom:2px;">設置場所 (高さ基準)</label>
              <select id="monPlace" style="width:100%; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-size:11px;">
                <option value="floor">フロア（床置き）</option>
                <option value="stage">ステージ天板上</option>
              </select>
            </div>
            <div style="flex:1;"><label style="font-size:10px; color:#64748b;">位置X</label><input type="number" id="monX" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
            <div style="flex:1;"><label style="font-size:10px; color:#64748b;">位置Y</label><input type="number" id="monY" style="width:100%; padding:3px; border:1px solid #cbd5e1; border-radius:4px;"></div>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:10px; padding-top:8px; border-top:1px solid #e2e8f0;">
            <button type="button" class="btn-action btn-danger" style="padding:3px 8px; font-size:11px; background:#ef4444; color:#fff; border:none; border-radius:4px; cursor:pointer;" id="mon-del-btn">削除</button>
          </div>
        </div>
      </div>
      
      <!-- シミュレーション結果ログ -->
      <div class="ui-group" style="padding:10px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; margin-bottom:10px;">
        <div class="ui-group-title" style="font-weight:bold; font-size:12px; color:#0f172a; margin-bottom:6px;">👁️ 視認シミュレーション (視野角90°)</div>
        <div id="monSimResult" style="font-size:11px; color:#0f172a; max-height:220px; overflow-y:auto; background:#fff; padding:6px; border-radius:4px; border:1px solid #cbd5e1; line-height:1.5;">
          モニターを追加すると、ここに視認可能な範囲のログが表示されます。
        </div>
      </div>
    `;

    // イベント登録
    const addBtn = document.getElementById('mon-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => { 
      addMonitor(); updateUI(); renderCore(); 
      if (window.coreLog) window.coreLog('モニターを追加しました', 'info'); 
    });
    
    const delBtn = document.getElementById('mon-del-btn');
    if (delBtn) delBtn.addEventListener('click', () => { 
      deleteMonitor(); updateUI(); renderCore(); 
      if (window.coreLog) window.coreLog('モニターを削除しました', 'info'); 
    });
    
    const sel = document.getElementById('monSelect');
    if (sel) sel.addEventListener('change', (e) => { 
      selectedId = e.target.value; updateUI(); renderCore(); 
    });
    
    const inputIds = ['monTarget', 'monStand', 'monSize', 'monPan', 'monPlace', 'monX', 'monY'];
    inputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          applyChanges();
          updateSimulation();
          renderCore();
        });
      }
    });
    updateUI();
  }

  function renderCore() {
    if (typeof window.requestRender === 'function') window.requestRender();
    else if (typeof window.render === 'function') window.render();
  }

  function addMonitor() {
    if (typeof window.saveHistory === 'function') window.saveHistory();
    const num = monitors.length + 1;
    // デフォルトはステージ前の返しモニター（ロースタンド）
    const isEven = num % 2 === 0;
    const stg = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000 };
    
    monitors.push({
      id: 'MON-' + Date.now(),
      name: `モニター ${num}`,
      target: 'guest',    // 登壇者向け(返し)
      stand: 'low',       // ロースタンド
      size: '50',         // 50インチ
      panAngle: 0,
      placeOn: 'floor',
      x: stg.x + stg.w / 2 + (isEven ? 1800 : -1800),
      y: stg.y + stg.d + 500
    });
    selectedId = monitors[monitors.length - 1].id;
  }

  function deleteMonitor() {
    if (typeof window.saveHistory === 'function') window.saveHistory();
    monitors = monitors.filter(m => m.id !== selectedId);
    selectedId = monitors.length > 0 ? monitors[0].id : null;
  }

  function updateUI() {
    const sel = document.getElementById('monSelect');
    if (!sel) return;
    sel.innerHTML = '';
    monitors.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.innerText = `${m.name} (${m.size}" ${m.target === 'guest' ? '返し' : '客席向'})`;
      sel.appendChild(opt);
    });

    if (!selectedId && monitors.length > 0) selectedId = monitors[0].id;
    if (selectedId && !monitors.find(m => m.id === selectedId)) {
      selectedId = monitors.length > 0 ? monitors[0].id : null;
    }
    sel.value = selectedId || '';

    const ctrlArea = document.getElementById('monControls');
    const m = monitors.find(m => m.id === selectedId);
    if (!m) {
      if (ctrlArea) ctrlArea.style.display = 'none';
      return;
    }
    if (ctrlArea) ctrlArea.style.display = 'block';

    const targetEl = document.getElementById('monTarget');
    if (targetEl) targetEl.value = m.target;
    const standEl = document.getElementById('monStand');
    if (standEl) standEl.value = m.stand;
    const sizeEl = document.getElementById('monSize');
    if (sizeEl) sizeEl.value = m.size;
    const panEl = document.getElementById('monPan');
    if (panEl) panEl.value = Math.round(m.panAngle || 0);
    const placeEl = document.getElementById('monPlace');
    if (placeEl) placeEl.value = m.placeOn;
    const xEl = document.getElementById('monX');
    if (xEl) xEl.value = Math.round(m.x);
    const yEl = document.getElementById('monY');
    if (yEl) yEl.value = Math.round(m.y);

    updateSimulation();
  }

  function applyChanges() {
    const m = monitors.find(m => m.id === selectedId);
    if (!m) return;
    if (typeof window.saveHistory === 'function') window.saveHistory();
    
    const targetEl = document.getElementById('monTarget');
    if (targetEl) m.target = targetEl.value;
    const standEl = document.getElementById('monStand');
    if (standEl) m.stand = standEl.value;
    const sizeEl = document.getElementById('monSize');
    if (sizeEl) m.size = sizeEl.value;
    const panEl = document.getElementById('monPan');
    if (panEl) m.panAngle = parseFloat(panEl.value) || 0;
    const placeEl = document.getElementById('monPlace');
    if (placeEl) m.placeOn = placeEl.value;
    const xEl = document.getElementById('monX');
    if (xEl) m.x = parseFloat(xEl.value) || 0;
    const yEl = document.getElementById('monY');
    if (yEl) m.y = parseFloat(yEl.value) || 0;
  }

  /**
   * 視認シミュレーションロジック
   * モニターの角度から視野角（±45度）に登壇者や客席の列が含まれるか算出し、ログパネルに出力する
   */
  function updateSimulation() {
    const resDiv = document.getElementById('monSimResult');
    if (!resDiv) return;
    if (monitors.length === 0) {
      resDiv.innerHTML = 'モニターが配置されていません。';
      return;
    }

    let html = '';
    monitors.forEach(m => {
      // target によって基準の向きを変える (-90=ステージ奥方向, 90=客席方向)
      const basePan = m.target === 'guest' ? -90 : 90;
      const absPan = basePan + (m.panAngle || 0);

      html += `<div style="margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed #cbd5e1;">`;
      html += `<strong style="color:#2563eb;">${m.name} [${SIZE_MAP[m.size]?m.size:50}ｲﾝﾁ / ${m.target === 'guest'?'返し':'演出'}]</strong><br>`;
      
      // ▼ 返しモニター (登壇者への視認性)
      if (m.target === 'guest') {
        let guestsData = [];
        if (window.guests) {
            guestsData = window.guests;
        } else if (window.tabGuestsModule && typeof window.tabGuestsModule.exportData === 'function') {
            const exp = window.tabGuestsModule.exportData();
            if(exp && exp.guests) guestsData = exp.guests;
            else if (Array.isArray(exp)) guestsData = exp;
        }

        if (!guestsData || guestsData.length === 0) {
          html += `<span style="color:#64748b;">登壇者が配置されていません</span>`;
        } else {
          guestsData.forEach(g => {
            if(!g.enabled && g.enabled !== undefined) return;
            const angle = Math.atan2(g.y - m.y, g.x - m.x) * 180 / Math.PI;
            let diff = Math.abs(angle - absPan);
            while (diff > 180) diff = Math.abs(diff - 360);
            
            const inFov = diff <= 45; // 視野角90度 (片側45度)
            html += ` ${inFov ? '🟢' : '🔴'} ${g.name||'登壇者'}: 角度ズレ ${Math.round(diff)}° ${inFov ? '(視野内)' : '(見えません)'}<br>`;
          });
        }
      } 
      // ▼ 演出モニター (客席への視認性)
      else {
        let seatsData = [];
        if (window.seats) {
            seatsData = window.seats;
        } else if (window.tabSeatsModule && typeof window.tabSeatsModule.exportData === 'function') {
            const exp = window.tabSeatsModule.exportData();
            if(exp && exp.seats) seatsData = exp.seats;
            else if (Array.isArray(exp)) seatsData = exp;
        }

        if (!seatsData || seatsData.length === 0) {
          html += `<span style="color:#64748b;">客席が配置されていません</span>`;
        } else {
          // 列(Row)ごとに集計して横方向の端だけ判定
          const rowMap = {};
          seatsData.forEach(s => {
            const r = s.row || 1;
            if (!rowMap[r]) rowMap[r] = [];
            rowMap[r].push(s);
          });
          
          const rows = Object.keys(rowMap).sort((a,b) => parseInt(a) - parseInt(b));
          rows.forEach(r => {
            const rSeats = rowMap[r].sort((a,b) => a.x - b.x);
            const leftSeat = rSeats[0];
            const rightSeat = rSeats[rSeats.length - 1];

            const checkFov = (seat) => {
              const angle = Math.atan2(seat.y - m.y, seat.x - m.x) * 180 / Math.PI;
              let diff = Math.abs(angle - absPan);
              while (diff > 180) diff = Math.abs(diff - 360);
              return diff <= 45;
            };

            const lOk = checkFov(leftSeat);
            const rOk = checkFov(rightSeat);

            if (lOk && rOk) {
              html += ` 列${r}: 🟢 全幅で視認可能<br>`;
            } else if (!lOk && !rOk) {
              html += ` 列${r}: 🔴 両端とも視野外 (見えない)<br>`;
            } else {
              html += ` 列${r}: 🟡 片側見切れ (左:${lOk?'○':'×'} 右:${rOk?'○':'×'})<br>`;
            }
          });
        }
      }
      html += `</div>`;
    });
    resDiv.innerHTML = html;
  }

  // 自動更新用のタイマー変数
  let lastSimTime = 0;

  function drawTop(tCtx) {
    // 0.5秒おきにシミュレーション結果を再評価（他オブジェクト移動追従用）
    if (Date.now() - lastSimTime > 500) {
      updateSimulation();
      lastSimTime = Date.now();
    }

    monitors.forEach(m => {
      const isSel = m.id === selectedId;
      const sizeInfo = SIZE_MAP[m.size] || SIZE_MAP['50'];
      const standInfo = STAND_TYPES[m.stand];
      const basePan = m.target === 'guest' ? -90 : 90;
      const absPan = basePan + (m.panAngle || 0);
      const rad = absPan * Math.PI / 180;
      
      // 視野コーン（設定の表示トグルに連動するか、ここではデフォルトで描画）
      const showFov = (window.displaySettings && window.displaySettings.showFov !== undefined) ? window.displaySettings.showFov : true;
      if (showFov) {
        tCtx.save();
        tCtx.translate(m.x, m.y);
        const fovRad = 90 * Math.PI / 180; // 総視野角90度
        const coneDist = m.target === 'guest' ? 5000 : 12000; // 客席向けは奥まで
        tCtx.fillStyle = isSel ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.04)';
        tCtx.beginPath();
        tCtx.moveTo(0, 0);
        tCtx.arc(0, 0, coneDist, rad - fovRad/2, rad + fovRad/2);
        tCtx.closePath();
        tCtx.fill();
        
        tCtx.strokeStyle = isSel ? '#0ea5e9' : '#cbd5e1';
        tCtx.lineWidth = 15;
        tCtx.beginPath();
        tCtx.moveTo(0, 0);
        tCtx.lineTo(coneDist * Math.cos(rad - fovRad/2), coneDist * Math.sin(rad - fovRad/2));
        tCtx.moveTo(0, 0);
        tCtx.lineTo(coneDist * Math.cos(rad + fovRad/2), coneDist * Math.sin(rad + fovRad/2));
        tCtx.stroke();
        tCtx.restore();
      }

      tCtx.save();
      tCtx.translate(m.x, m.y);
      // 正面をY軸プラス(下方向)として描画するため、90度分マイナス回転
      tCtx.rotate(rad - Math.PI/2); 

      // スタンド/キャスターベースの描画
      tCtx.strokeStyle = isSel ? '#2563eb' : '#64748b';
      tCtx.fillStyle = isSel ? '#e0f2fe' : '#f8fafc';
      tCtx.lineWidth = 20;
      
      const bd = standInfo.baseD;
      tCtx.beginPath();
      if (m.stand === 'low') {
        // 画像1：H型ロースタンドベース
        tCtx.rect(-bd/2, -bd/4, bd, bd/2);
        tCtx.fill(); tCtx.stroke();
        tCtx.fillStyle = '#475569';
        const cr = 35;
        tCtx.beginPath(); tCtx.arc(-bd/2+cr, -bd/4+cr, cr, 0, Math.PI*2); tCtx.fill();
        tCtx.beginPath(); tCtx.arc(bd/2-cr, -bd/4+cr, cr, 0, Math.PI*2); tCtx.fill();
        tCtx.beginPath(); tCtx.arc(-bd/2+cr, bd/4-cr, cr, 0, Math.PI*2); tCtx.fill();
        tCtx.beginPath(); tCtx.arc(bd/2-cr, bd/4-cr, cr, 0, Math.PI*2); tCtx.fill();
      } else {
        // 画像2：V字・K字型スタンドベース
        tCtx.moveTo(0, 0); tCtx.lineTo(bd/2, bd/2);
        tCtx.moveTo(0, 0); tCtx.lineTo(-bd/2, bd/2);
        tCtx.moveTo(0, 0); tCtx.lineTo(0, -bd/3);
        tCtx.stroke();
        tCtx.fillStyle = '#475569';
        tCtx.beginPath(); tCtx.arc(bd/2, bd/2, 35, 0, Math.PI*2); tCtx.fill();
        tCtx.beginPath(); tCtx.arc(-bd/2, bd/2, 35, 0, Math.PI*2); tCtx.fill();
        tCtx.beginPath(); tCtx.arc(0, -bd/3, 35, 0, Math.PI*2); tCtx.fill();
      }

      // モニター本体（正面はY+方向）
      tCtx.fillStyle = isSel ? '#0ea5e9' : '#1e293b';
      tCtx.fillRect(-sizeInfo.w/2, 20, sizeInfo.w, 50);
      tCtx.strokeStyle = isSel ? '#2563eb' : '#0284c7';
      tCtx.lineWidth = 15;
      tCtx.strokeRect(-sizeInfo.w/2, 20, sizeInfo.w, 50);
      tCtx.restore();

      // テキストラベル
      tCtx.fillStyle = '#0f172a';
      tCtx.font = 'bold 150px sans-serif';
      tCtx.textAlign = 'center';
      if (typeof window.drawOutlinedText === 'function') {
        window.drawOutlinedText(tCtx, `${m.name}`, m.x, m.y + standInfo.baseD/2 + 150, 30);
      } else {
        tCtx.fillText(`${m.name}`, m.x, m.y + standInfo.baseD/2 + 150);
      }
    });
  }

  function drawSide(tCtx, sliceX) {
    monitors.forEach(m => {
      // 独自の「カメラ光軸スライス判定」を廃止し、Xスライス座標による判定に統一
      if (typeof sliceX === 'number') {
        const boundRadius = (SIZE_MAP[m.size] || SIZE_MAP['50']).w / 2 + 500;
        if (Math.abs(m.x - sliceX) > boundRadius) {
          return;
        }
      }

      const isSel = m.id === selectedId;
      const sizeInfo = SIZE_MAP[m.size] || SIZE_MAP['50'];
      const standInfo = STAND_TYPES[m.stand];
      const h = sizeInfo.h;
      
      let baseZ = 0;
      if (m.placeOn === 'stage' && typeof window.isInsideStage === 'function' && window.isInsideStage(m.x, m.y)) {
         baseZ = window.stage ? window.stage.h : 0;
      }
      
      const centerZ = baseZ + standInfo.defaultZ;
      const basePan = m.target === 'guest' ? -90 : 90;
      const absPan = basePan + (m.panAngle || 0);
      
      // SideViewの横軸は奥行き(Y)。客席側(Y+)を向いている時は右向き、ステージ奥(Y-)なら左向きとする
      let isFacingLeft = (absPan <= 0 || absPan >= 180);
      let tilt = standInfo.tilt; 
      if (isFacingLeft) tilt = -tilt; // 左向きのときはチルト角を反転させて仰角を保つ

      tCtx.save();
      tCtx.translate(m.y, -centerZ); // 高さ方向は -Z
      
      // スタンドポール
      tCtx.strokeStyle = isSel ? '#2563eb' : '#64748b';
      tCtx.lineWidth = 20;
      tCtx.beginPath();
      tCtx.moveTo(0, standInfo.defaultZ); // フロアから
      tCtx.lineTo(0, 0); // 画面中心まで
      tCtx.stroke();
      
      // キャスターベースの側面
      tCtx.fillStyle = '#475569';
      tCtx.fillRect(-150, standInfo.defaultZ - 30, 300, 30);
      
      // 画面本体
      tCtx.rotate(tilt * Math.PI / 180);
      tCtx.fillStyle = isSel ? '#e0f2fe' : '#0f172a';
      tCtx.strokeStyle = isSel ? '#2563eb' : '#0ea5e9';
      tCtx.lineWidth = 15;
      tCtx.fillRect(-25, -h/2, 50, h);
      tCtx.strokeRect(-25, -h/2, 50, h);
      
      // 画面の面(発光面)
      tCtx.fillStyle = '#38bdf8';
      if (isFacingLeft) {
        tCtx.fillRect(-25, -h/2, 10, h);
      } else {
        tCtx.fillRect(15, -h/2, 10, h);
      }
      tCtx.restore();

      // テキストラベル
      tCtx.fillStyle = '#0f172a';
      tCtx.font = 'bold 160px sans-serif';
      tCtx.textAlign = 'center';
      if (typeof window.drawOutlinedText === 'function') {
        window.drawOutlinedText(tCtx, `${m.name}(${m.size}")`, m.y, -centerZ - h/2 - 120, 30);
      } else {
        tCtx.fillText(`${m.name}(${m.size}")`, m.y, -centerZ - h/2 - 120);
      }
    });
  }

  function hitTest(wx, wy) {
    if (typeof viewMode !== 'undefined' && viewMode === 'side') {
      for (let i = monitors.length - 1; i >= 0; i--) {
        const m = monitors[i];
        let baseZ = 0;
        if (m.placeOn === 'stage' && typeof window.isInsideStage === 'function' && window.isInsideStage(m.x, m.y)) {
             baseZ = window.stage ? window.stage.h : 0;
        }
        const centerZ = baseZ + STAND_TYPES[m.stand].defaultZ;
        // SideView: x軸は Y座標, y軸は -Z座標
        if (Math.hypot(m.y - wx, centerZ - (-wy)) < 500) {
          selectedId = m.id; updateUI();
          if (typeof window.switchTab === 'function') window.switchTab('monitor');
          return { type: 'monitor_side', id: m.id };
        }
      }
    } else {
      for (let i = monitors.length - 1; i >= 0; i--) {
        const m = monitors[i];
        const r = (SIZE_MAP[m.size] || SIZE_MAP['50']).w / 2 + 150;
        if (Math.hypot(m.x - wx, m.y - wy) < r) {
          selectedId = m.id; updateUI();
          if (typeof window.switchTab === 'function') window.switchTab('monitor');
          return { type: 'monitor', id: m.id };
        }
      }
    }
    return null;
  }

  function handleDrag(target, wx, wy) {
    const m = monitors.find(m => m.id === target.id);
    if (!m) return;
    if (target.type === 'monitor') {
      m.x = wx; m.y = wy;
      if (selectedId === m.id) {
        const ix = document.getElementById('monX');
        const iy = document.getElementById('monY');
        if (ix) ix.value = Math.round(wx);
        if (iy) iy.value = Math.round(wy);
      }
      updateSimulation();
      return true;
    } else if (target.type === 'monitor_side') {
      m.y = wx; // Z軸(wy)へのドラッグ移動はスタンドの高さで固定されているため無視し、奥行きY軸のみ反映
      if (selectedId === m.id) {
        const iy = document.getElementById('monY');
        if (iy) iy.value = Math.round(wx);
      }
      updateSimulation();
      return true;
    }
    return false;
  }

  function exportData() { 
      return {
          monitors: JSON.parse(JSON.stringify(monitors)),
          selectedId: selectedId
      }; 
  }
  
  function importData(data) {
    if (!data) return;
    if (Array.isArray(data)) {
        // 旧フォーマット
        monitors = data;
        selectedId = monitors.length > 0 ? monitors[0].id : null;
    } else {
        if (Array.isArray(data.monitors)) {
            monitors = data.monitors;
        }
        if (data.selectedId) {
            selectedId = data.selectedId;
        }
    }
    updateUI();
  }

  function setup() {
    initUI();
    // UIが空になった場合に備えて、タブボタンクリック時に自己修復するイベント
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = findOrCreateTargetPanel();
        if (panel && (!panel.innerHTML || panel.innerHTML.trim() === '')) {
          initUI();
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  return {
    initUI,
    drawTop,
    drawSide,
    hitTest,
    handleDrag,
    exportData,
    importData,
    updateSimulation
  };
})();