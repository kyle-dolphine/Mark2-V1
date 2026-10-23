/**
 * ============================================================================
 * ENG Sightline & Stage Simulator Mark2
 * モジュール：【ノート9：機材・備品】 tab9_equipment.js
 * 
 * 担当機能：
 *  - オペ卓（机、W/D/H変更、名称変更、椅子W900につき1席配置）
 *  - 制作物（展示台テンプレ、四角/丸/三角の形状変更、W/D/H変更）
 *  - 照明（スタンド型、三脚800角ベース、画角描写なし）
 *  - Top平面図、Side立面図（スライス判定）の描画
 *  - hitTest / handleDrag によるマウス操作
 *  - exportData / importData によるUndo/Redo完全連動
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. データモデル初期化
  // ==========================================================================
  window.equipments = window.equipments || [];
  window.selectedEquipId = window.selectedEquipId || null;

  // ==========================================================================
  // 2. UIテンプレート自動生成 (#panel-equipment へのインジェクション)
  // ==========================================================================
  function injectEquipmentUI() {
    const container = document.getElementById('panel-equipment');
    if (!container) return;

    container.innerHTML = `
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>🛠 機材・備品 (オペ卓/制作物/照明)</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-action" id="btnAddOpe" style="padding:2px 6px; font-size:10px;">＋ オペ卓</button>
            <button class="btn-action" id="btnAddCustom" style="padding:2px 6px; font-size:10px;">＋ 制作物</button>
            <button class="btn-action" id="btnAddLight" style="padding:2px 6px; font-size:10px;">＋ 照明</button>
            <button class="btn-action btn-danger" id="btnDelEquip" style="padding:2px 6px; font-size:10px;">削除</button>
          </div>
        </div>
        
        <div class="ui-row full">
          <div class="input-box">
            <label>選択中の機材</label>
            <select id="equipSelect"></select>
          </div>
        </div>

        <div class="ui-row">
          <div class="input-box"><label>名称</label><input type="text" id="equipName"></div>
          <div class="input-box"><label>種類</label><input type="text" id="equipTypeDisplay" disabled style="background:#f1f5f9;"></div>
        </div>

        <!-- 共通サイズ・配置 -->
        <div class="ui-row" style="grid-template-columns: 1fr 1fr 1fr;">
          <div class="input-box"><label>配置 X (mm)</label><input type="number" id="equipX" step="100"></div>
          <div class="input-box"><label>配置 Y (mm)</label><input type="number" id="equipY" step="100"></div>
          <div class="input-box"><label>角度 (°)</label><input type="number" id="equipAngle" step="5"></div>
        </div>

        <div class="ui-row" style="grid-template-columns: 1fr 1fr 1fr;">
          <div class="input-box"><label id="labelEquipW">幅 W (mm)</label><input type="number" id="equipW" step="100"></div>
          <div class="input-box"><label id="labelEquipD">奥行 D (mm)</label><input type="number" id="equipD" step="100"></div>
          <div class="input-box"><label id="labelEquipH">高さ H (mm)</label><input type="number" id="equipH" step="100"></div>
        </div>

        <!-- オペ卓専用 -->
        <div class="ui-row full" id="equipOpeBox" style="display:none; margin-top:4px;">
          <label style="font-size:11px; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" id="equipHasChairs"> 🪑 椅子を付ける (W900につき1席自動配置)
          </label>
        </div>

        <!-- 制作物専用 -->
        <div class="ui-row full" id="equipCustomBox" style="display:none; margin-top:4px;">
          <div class="input-box" style="width:100%;">
            <label>形状</label>
            <select id="equipShape">
              <option value="rect">四角形</option>
              <option value="circle">丸 (円形・楕円)</option>
              <option value="triangle">三角形</option>
            </select>
          </div>
        </div>

        <!-- 照明専用の補足テキスト -->
        <div class="ui-row full" id="equipLightBox" style="display:none; margin-top:4px; font-size:10px; color:#64748b;">
          ※照明スタンド型。WとDは三脚のフットプリント（推奨800角）、Hはスタンド高さを指定します。画角の描画は行いません。
        </div>

      </div>
    `;
    bindEvents();
    syncUI();
  }

  // ==========================================================================
  // 3. UIイベントリスナー登録
  // ==========================================================================
  function bindEvents() {
    // --- 追加・削除ボタン ---
    document.getElementById('btnAddOpe').addEventListener('click', () => addEquip('ope'));
    document.getElementById('btnAddCustom').addEventListener('click', () => addEquip('custom'));
    document.getElementById('btnAddLight').addEventListener('click', () => addEquip('light'));
    document.getElementById('btnDelEquip').addEventListener('click', delEquip);

    // --- セレクトボックス ---
    document.getElementById('equipSelect').addEventListener('change', function(e) {
      window.selectedEquipId = e.target.value;
      syncUI();
      triggerRender();
    });

    // --- パラメータ変更イベント ---
    const onParamChange = function() {
      const eq = window.equipments.find(e => e.id === window.selectedEquipId);
      if (!eq) return;
      pushUndo();
      
      eq.name = document.getElementById('equipName').value || '無名';
      eq.x = parseFloat(document.getElementById('equipX').value) || 0;
      eq.y = parseFloat(document.getElementById('equipY').value) || 0;
      eq.angle = parseFloat(document.getElementById('equipAngle').value) || 0;
      eq.w = parseFloat(document.getElementById('equipW').value) || 100;
      eq.d = parseFloat(document.getElementById('equipD').value) || 100;
      eq.h = parseFloat(document.getElementById('equipH').value) || 100;

      if (eq.type === 'ope') {
        eq.hasChairs = document.getElementById('equipHasChairs').checked;
      } else if (eq.type === 'custom') {
        eq.shape = document.getElementById('equipShape').value;
      }
      
      syncUI();
      triggerRender();
    };

    ['equipName', 'equipX', 'equipY', 'equipAngle', 'equipW', 'equipD', 'equipH', 'equipShape']
      .forEach(id => document.getElementById(id).addEventListener('change', onParamChange));
    document.getElementById('equipHasChairs').addEventListener('change', onParamChange);
  }

  // ==========================================================================
  // 4. データ・UI 同期・CRUD処理
  // ==========================================================================
  function addEquip(type) {
    pushUndo();
    const num = window.equipments.length + 1;
    const newId = 'EQ' + Date.now();
    let base = { id: newId, type: type, x: 5000, y: 5000, angle: 0 };

    if (type === 'ope') {
      base.name = `オペ卓 ${num}`;
      base.w = 1800; base.d = 600; base.h = 700;
      base.hasChairs = true;
    } else if (type === 'custom') {
      base.name = `展示台 ${num}`;
      base.w = 900; base.d = 900; base.h = 1000;
      base.shape = 'rect';
    } else if (type === 'light') {
      base.name = `照明（スタンド） ${num}`;
      base.w = 800; base.d = 800; base.h = 2000; // 三脚800角
    }

    window.equipments.push(base);
    window.selectedEquipId = newId;
    syncUI();
    triggerRender();
  }

  function delEquip() {
    if (window.equipments.length === 0) return;
    pushUndo();
    window.equipments = window.equipments.filter(e => e.id !== window.selectedEquipId);
    window.selectedEquipId = window.equipments.length > 0 ? window.equipments[0].id : null;
    syncUI();
    triggerRender();
  }

  function syncUI() {
    const sel = document.getElementById('equipSelect');
    if (!sel) return;

    sel.innerHTML = '';
    window.equipments.forEach(eq => {
      const opt = document.createElement('option');
      opt.value = eq.id;
      opt.textContent = `${eq.name} (${eq.type})`;
      sel.appendChild(opt);
    });

    // アイテムが0個の場合の無効化処理
    if (window.equipments.length === 0) {
      window.selectedEquipId = null;
      document.getElementById('equipName').value = '';
      document.getElementById('equipTypeDisplay').value = '機材なし';
      document.getElementById('equipOpeBox').style.display = 'none';
      document.getElementById('equipCustomBox').style.display = 'none';
      document.getElementById('equipLightBox').style.display = 'none';
      return;
    }

    if (!window.equipments.find(e => e.id === window.selectedEquipId)) {
      window.selectedEquipId = window.equipments[0].id;
    }
    sel.value = window.selectedEquipId;

    const eq = window.equipments.find(e => e.id === window.selectedEquipId);
    if (eq) {
      document.getElementById('equipName').value = eq.name;
      document.getElementById('equipTypeDisplay').value = 
        eq.type === 'ope' ? 'オペ卓' : 
        eq.type === 'custom' ? '制作物' : '照明';
      document.getElementById('equipX').value = Math.round(eq.x);
      document.getElementById('equipY').value = Math.round(eq.y);
      document.getElementById('equipAngle').value = eq.angle || 0;
      document.getElementById('equipW').value = eq.w;
      document.getElementById('equipD').value = eq.d;
      document.getElementById('equipH').value = eq.h;

      document.getElementById('equipOpeBox').style.display = eq.type === 'ope' ? 'flex' : 'none';
      if (eq.type === 'ope') document.getElementById('equipHasChairs').checked = eq.hasChairs;

      document.getElementById('equipCustomBox').style.display = eq.type === 'custom' ? 'flex' : 'none';
      if (eq.type === 'custom') document.getElementById('equipShape').value = eq.shape || 'rect';

      document.getElementById('equipLightBox').style.display = eq.type === 'light' ? 'flex' : 'none';
    }
  }

  // ==========================================================================
  // 5. 描画連動 (平面図 Top / 立面図 Side)
  // ==========================================================================
  function drawEquipmentTop(ctx) {
    if (!window.equipments || window.equipments.length === 0) return;

    window.equipments.forEach(eq => {
      ctx.save();
      // 中心座標へ移動し、角度を適用
      ctx.translate(eq.x, eq.y);
      ctx.rotate((eq.angle || 0) * Math.PI / 180);

      const isSel = (eq.id === window.selectedEquipId);
      ctx.strokeStyle = isSel ? '#2563eb' : '#475569';
      ctx.lineWidth = isSel ? 30 : 20;

      if (eq.type === 'ope') {
        // --- 1. オペ卓 ---
        ctx.fillStyle = isSel ? '#bfdbfe' : '#f1f5f9';
        ctx.fillRect(-eq.w/2, -eq.d/2, eq.w, eq.d);
        ctx.strokeRect(-eq.w/2, -eq.d/2, eq.w, eq.d);

        // 椅子（W900につき1席を自動配置）
        if (eq.hasChairs) {
          const chairCount = Math.max(1, Math.floor(eq.w / 900));
          const chairW = 400;
          const chairD = 400;
          const startX = -eq.w/2 + (eq.w / (chairCount * 2));
          const spacingX = eq.w / chairCount;
          const chairY = eq.d/2 + chairD/2 + 100; // 机の手前(下側)100mmに配置

          ctx.fillStyle = '#cbd5e1';
          for (let i = 0; i < chairCount; i++) {
            const cx = startX + i * spacingX - chairW/2;
            const cy = chairY - chairD/2;
            ctx.fillRect(cx, cy, chairW, chairD);
            ctx.strokeRect(cx, cy, chairW, chairD);
          }
        }

      } else if (eq.type === 'custom') {
        // --- 2. 制作物（展示台など） ---
        ctx.fillStyle = isSel ? '#fef08a' : '#fef9c3';
        if (eq.shape === 'rect') {
          ctx.fillRect(-eq.w/2, -eq.d/2, eq.w, eq.d);
          ctx.strokeRect(-eq.w/2, -eq.d/2, eq.w, eq.d);
        } else if (eq.shape === 'circle') {
          ctx.beginPath();
          ctx.ellipse(0, 0, eq.w/2, eq.d/2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (eq.shape === 'triangle') {
          ctx.beginPath();
          // 上向きの三角形（重心を中心に）
          ctx.moveTo(0, -eq.d/2);
          ctx.lineTo(eq.w/2, eq.d/2);
          ctx.lineTo(-eq.w/2, eq.d/2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

      } else if (eq.type === 'light') {
        // --- 3. 照明（スタンド・三脚） ---
        ctx.beginPath();
        // 三脚をY字の3本線で表現
        for(let i=0; i<3; i++) {
          let a = (i * 120 + 90) * Math.PI / 180;
          let r = Math.min(eq.w, eq.d) / 2;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
        }
        ctx.stroke();

        // ライトヘッド部分（長方形）
        ctx.fillStyle = isSel ? '#fde047' : '#ffffff';
        const headW = 300;
        const headD = 100;
        ctx.fillRect(-headW/2, -headD/2, headW, headD);
        ctx.strokeRect(-headW/2, -headD/2, headW, headD);
      }

      // 名称ラベル（機材と一緒に回転）
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(eq.name, 0, 0);

      ctx.restore();
    });
  }

  function drawEquipmentSide(ctx, sliceX) {
    if (!window.equipments || window.equipments.length === 0) return;

    window.equipments.forEach(eq => {
      // 回転を考慮したX軸方向の最大スパンを簡易計算
      const rad = (eq.angle || 0) * Math.PI / 180;
      const halfW = eq.w / 2;
      const halfD = eq.d / 2;
      const spanX = Math.abs(halfW * Math.cos(rad)) + Math.abs(halfD * Math.sin(rad));

      // スライス位置(X)が機材の幅範囲内にある場合のみ断面を描画
      if (sliceX >= eq.x - spanX && sliceX <= eq.x + spanX) {
        ctx.save();
        const isSel = (eq.id === window.selectedEquipId);
        ctx.strokeStyle = isSel ? '#2563eb' : '#475569';
        ctx.lineWidth = 20;

        // 床置き(Z=0)を基本とするが、ステージ上にある場合は高さをかさ上げする
        let baseZ = 0;
        if (window.stage) {
          if (eq.x >= window.stage.x && eq.x <= window.stage.x + window.stage.w &&
              eq.y >= window.stage.y && eq.y <= window.stage.y + window.stage.d) {
            baseZ = window.stage.h;
          }
        }

        if (eq.type === 'ope' || eq.type === 'custom') {
          // 回転後のY軸方向の幅スパンを計算
          const spanY = Math.abs(halfW * Math.sin(rad)) + Math.abs(halfD * Math.cos(rad));
          ctx.fillStyle = eq.type === 'ope' ? (isSel ? '#bfdbfe' : '#f1f5f9') : (isSel ? '#fef08a' : '#fef9c3');
          
          // Y座標を中心に前後にspanY分、高さは-baseZから上に-eq.h
          ctx.fillRect(eq.y - spanY, -baseZ, spanY * 2, -eq.h);
          ctx.strokeRect(eq.y - spanY, -baseZ, spanY * 2, -eq.h);

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 100px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${eq.name} (H:${eq.h})`, eq.y, -baseZ - eq.h - 50);

          // オペ卓の椅子の立面
          if (eq.type === 'ope' && eq.hasChairs) {
            const chairCenterY = eq.y + spanY + 250; // 机の奥行き端から250mm手前に描画
            ctx.fillStyle = '#cbd5e1';
            const chairH = 450;
            const chairD = 400;
            ctx.fillRect(chairCenterY - chairD/2, -baseZ, chairD, -chairH);
            ctx.strokeRect(chairCenterY - chairD/2, -baseZ, chairD, -chairH);
          }

        } else if (eq.type === 'light') {
          // 照明スタンドの立面（ポールとヘッド）
          ctx.beginPath();
          ctx.moveTo(eq.y, -baseZ);
          ctx.lineTo(eq.y, -baseZ - eq.h + 50); // ヘッドの下まで
          ctx.lineWidth = 15;
          ctx.stroke();

          ctx.fillStyle = isSel ? '#fde047' : '#ffffff';
          ctx.fillRect(eq.y - 100, -baseZ - eq.h, 200, 100);
          ctx.strokeRect(eq.y - 100, -baseZ - eq.h, 200, 100);

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 100px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${eq.name} (H:${eq.h})`, eq.y, -baseZ - eq.h - 50);
        }

        ctx.restore();
      }
    });
  }

  // ==========================================================================
  // 6. マウスヒットテスト & ドラッグハンドラ
  // ==========================================================================
  function hitTest(wx, wy) {
    if (!window.equipments || window.equipments.length === 0) return null;

    // 後から追加されたものが上に描画されるので、逆順で判定
    for (let i = window.equipments.length - 1; i >= 0; i--) {
      const eq = window.equipments[i];
      // 逆回転させてバウンディングボックスで簡易判定
      const dx = wx - eq.x;
      const dy = wy - eq.y;
      const rad = -(eq.angle || 0) * Math.PI / 180;
      const rdx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const rdy = dx * Math.sin(rad) + dy * Math.cos(rad);

      // 照明の場合はW/Dが三脚の広がり（例800角）なのでそのまま判定可能
      if (Math.abs(rdx) <= eq.w / 2 && Math.abs(rdy) <= eq.d / 2) {
        window.selectedEquipId = eq.id;
        syncUI();
        triggerRender();
        return { type: 'equipment', item: eq, offsetX: eq.x - wx, offsetY: eq.y - wy };
      }
    }
    return null;
  }

  function handleDrag(target, wx, wy) {
    if (target.type === 'equipment') {
      target.item.x = Math.round(wx + target.offsetX);
      target.item.y = Math.round(wy + target.offsetY);
      syncUI(); 
      triggerRender();
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 7. データ入出力 (exportData / importData - Undo/Redo 連動)
  // ==========================================================================
  function exportData() {
    return {
      equipments: JSON.parse(JSON.stringify(window.equipments)),
      selectedEquipId: window.selectedEquipId
    };
  }

  function importData(data) {
    if (!data) return;
    if (data.equipments) window.equipments = JSON.parse(JSON.stringify(data.equipments));
    if (data.selectedEquipId) window.selectedEquipId = data.selectedEquipId;
    syncUI();
  }

  function triggerRender() {
    if (typeof window.requestRender === 'function') window.requestRender();
    else if (typeof window.render === 'function') window.render();
  }

  function pushUndo() {
    if (typeof window.saveHistory === 'function') window.saveHistory();
  }

  // ==========================================================================
  // 8. モジュール登録 & 自動初期化
  // ==========================================================================
  window.tabEquipmentModule = {
    drawTop: drawEquipmentTop,
    drawSide: drawEquipmentSide,
    hitTest: hitTest,
    handleDrag: handleDrag,
    exportData: exportData,
    importData: importData,
    syncUI: syncUI
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectEquipmentUI);
  } else {
    injectEquipmentUI();
  }

})();