/* ==========================================================================
   タブ11：背景図面（下絵）モジュール (tab11_bgimage.js)
   ・最前面オーバーレイ投影（ステージの下敷きになる問題を完全解決）
   ・クリック完全透過機能（図面越しに客席をドラッグ操作可能）
   ・スケール上限 1000% 対応版
   ========================================================================== */

(function() {
  // ===== 再描画・履歴保存ヘルパー =====
  function triggerRender() {
    if (typeof requestRender === 'function') requestRender();
    else if (typeof render === 'function') render();
    else if (window.requestRender) window.requestRender();
    else if (window.render) window.render();
  }

  function triggerSave() {
    if (typeof saveHistory === 'function') saveHistory();
    else if (window.saveHistory) window.saveHistory();
  }

  // ===== 内部変数 =====
  let bgImageObj = null;
  let bgProps = {
    visible: true,
    opacity: 0.4,
    x: 0,
    y: 0,
    baseW: 10000,
    baseD: 10000,
    scalePct: 100, // %倍率 (比率固定)
    angle: 0,      // 回転角度 (度)
    dragMode: false
  };

  const BgImageModule = {
    // 1. UIパネル構築
    initUI: function() {
      const panel = document.getElementById('panel-bgimage');
      if (!panel) return;

      panel.innerHTML = `
        <div class="ui-group">
          <div class="ui-group-title">
            <span>図面ファイル</span>
            <button type="button" class="btn-action" style="padding:1px 6px; font-size:10px;" onclick="window.tabBgimageModule.clearBgImage()">✕ 削除</button>
          </div>
          <div class="ui-row">
            <input type="file" id="bgImageInput" accept="image/*" style="font-size:10px;" onchange="window.tabBgimageModule.loadBgImage(event)">
            <label style="font-size:10px; display:flex; align-items:center; gap:3px;">
              <input type="checkbox" id="bgVisible" checked onchange="window.tabBgimageModule.updateBgParams()"> 表示
            </label>
          </div>
        </div>

        <div class="ui-group">
          <div class="ui-group-title">透明度</div>
          <div class="ui-row">
            <input type="range" id="bgOpacity" min="0.05" max="1" step="0.05" value="0.4" style="width:120px;" oninput="window.tabBgimageModule.updateBgParams()">
            <span id="bgOpacityVal" style="font-size:10px; font-weight:bold; min-width:35px;">40%</span>
          </div>
        </div>

        <div class="ui-group">
          <div class="ui-group-title">
            <span>拡大・縮小スケール (比率固定)</span>
            <span id="bgScaleVal" style="font-size:10px; font-weight:bold; color:#0284c7;">100%</span>
          </div>
          <div class="input-box">
            <!-- ★ 上限を 300 から 1000 に変更 -->
            <input type="range" id="bgScaleSlider" min="10" max="1000" step="1" value="100" oninput="window.tabBgimageModule.onBgScaleChange(this.value)">
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px; margin-top:4px;">
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.stepBgScale(-5)">-5%</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.stepBgScale(+5)">+5%</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.onBgScaleChange(100)">100%</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.fitBgToRoom()">全体化</button>
          </div>
        </div>

        <div class="ui-group">
          <div class="ui-group-title">
            <span>回転角度</span>
            <span id="bgAngleVal" style="font-size:10px; font-weight:bold; color:#0284c7;">0°</span>
          </div>
          <div class="input-box">
            <input type="range" id="bgAngleSlider" min="-180" max="180" step="1" value="0" oninput="window.tabBgimageModule.onBgAngleChange(this.value)">
          </div>
          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:4px; margin-top:4px;">
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.stepBgAngle(-90)">-90°</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.stepBgAngle(+90)">+90°</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.stepBgAngle(-1)">-1°</button>
            <button type="button" class="btn-action" style="font-size:10px; padding:2px;" onclick="window.tabBgimageModule.stepBgAngle(+1)">+1°</button>
          </div>
        </div>

        <div class="ui-group">
          <div class="ui-group-title">図面の位置合わせ (ドラッグ)</div>
          <div class="ui-row full">
            <button type="button" id="btnBgDrag" class="btn-action" style="font-size:10px; padding:6px; width:100%;" onclick="window.tabBgimageModule.toggleBgDragMode()">
              🖐️ 図面ドラッグ移動モード: OFF
            </button>
          </div>
          <div style="font-size:9px; color:#64748b; margin-top:3px; line-height:1.3;">
            ※ONにすると図面をマウスで動かせます。<br>
            ※OFFにすると図面が固定され、透けた図面の下にある席や機材をクリックして動かせるようになります。
          </div>
        </div>
      `;
    },

    // 2. コントロール系関数
    loadBgImage: function(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          bgImageObj = img;
          const aspect = img.naturalHeight / img.naturalWidth;
          const roomW = (window.room && window.room.w) ? window.room.w : 10000;
          bgProps.baseW = roomW;
          bgProps.baseD = Math.round(roomW * aspect);
          bgProps.scalePct = 100;
          bgProps.angle = 0;
          bgProps.x = 0;
          bgProps.y = 0;

          const scaleSlider = document.getElementById('bgScaleSlider');
          if (scaleSlider) scaleSlider.value = 100;
          const scaleVal = document.getElementById('bgScaleVal');
          if (scaleVal) scaleVal.innerText = '100%';

          const angleSlider = document.getElementById('bgAngleSlider');
          if (angleSlider) angleSlider.value = 0;
          const angleVal = document.getElementById('bgAngleVal');
          if (angleVal) angleVal.innerText = '0°';

          triggerSave();
          triggerRender();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    },

    clearBgImage: function() {
      bgImageObj = null;
      const input = document.getElementById('bgImageInput');
      if (input) input.value = '';
      triggerSave();
      triggerRender();
    },

    updateBgParams: function() {
      const vis = document.getElementById('bgVisible');
      if (vis) bgProps.visible = vis.checked;
      
      const op = document.getElementById('bgOpacity');
      if (op) {
        bgProps.opacity = parseFloat(op.value) || 0.4;
        const opVal = document.getElementById('bgOpacityVal');
        if (opVal) opVal.innerText = `${Math.round(bgProps.opacity * 100)}%`;
      }
      triggerSave();
      triggerRender();
    },

    onBgScaleChange: function(val) {
      bgProps.scalePct = parseFloat(val) || 100;
      const slider = document.getElementById('bgScaleSlider');
      if (slider) slider.value = bgProps.scalePct;
      const disp = document.getElementById('bgScaleVal');
      if (disp) disp.innerText = `${Math.round(bgProps.scalePct)}%`;
      triggerSave();
      triggerRender();
    },

    stepBgScale: function(delta) {
      // ★ ＋/－ ボタンの上限を 1000 に変更
      let next = Math.max(10, Math.min(1000, bgProps.scalePct + delta));
      this.onBgScaleChange(next);
    },

    onBgAngleChange: function(val) {
      bgProps.angle = parseFloat(val) || 0;
      const slider = document.getElementById('bgAngleSlider');
      if (slider) slider.value = bgProps.angle;
      const disp = document.getElementById('bgAngleVal');
      if (disp) disp.innerText = `${Math.round(bgProps.angle)}°`;
      triggerSave();
      triggerRender();
    },

    stepBgAngle: function(delta) {
      let next = bgProps.angle + delta;
      while (next > 180) next -= 360;
      while (next < -180) next += 360;
      this.onBgAngleChange(next);
    },

    fitBgToRoom: function() {
      if (!bgImageObj) return;
      bgProps.x = 0;
      bgProps.y = 0;
      this.onBgScaleChange(100);
      this.onBgAngleChange(0);
    },

    toggleBgDragMode: function() {
      bgProps.dragMode = !bgProps.dragMode;
      const btn = document.getElementById('btnBgDrag');
      if (btn) {
        btn.innerText = bgProps.dragMode ? '🖐️ 図面ドラッグ移動モード: ON' : '🖐️ 図面ドラッグ移動モード: OFF';
        btn.classList.toggle('active', bgProps.dragMode);
        if (bgProps.dragMode) {
          btn.style.background = '#2563eb';
          btn.style.color = '#ffffff';
        } else {
          btn.style.background = '';
          btn.style.color = '';
        }
      }
      triggerRender();
    },

    // 3. 描画関数
    drawTop: function(tCtx) {
      // 下敷きになるのを防ぐため意図的に空
    },

    // 最前面へのオーバーレイ投影用
    drawOverlay: function(tCtx) {
      if (bgImageObj && bgProps.visible) {
        const curW = bgProps.baseW * (bgProps.scalePct / 100);
        const curD = bgProps.baseD * (bgProps.scalePct / 100);
        const centerX = bgProps.x + curW / 2;
        const centerY = bgProps.y + curD / 2;

        tCtx.save();
        tCtx.globalAlpha = bgProps.opacity;
        
        tCtx.translate(centerX, centerY);
        if (bgProps.angle) {
          tCtx.rotate((bgProps.angle * Math.PI) / 180);
        }

        tCtx.drawImage(bgImageObj, -curW / 2, -curD / 2, curW, curD);

        if (bgProps.dragMode) {
          tCtx.strokeStyle = '#2563eb';
          tCtx.lineWidth = 35;
          tCtx.setLineDash([120, 60]);
          tCtx.strokeRect(-curW / 2, -curD / 2, curW, curD);
        }
        tCtx.restore();
      }
    },

    drawSide: function(sCtx) { },

    // 4. マウス操作判定 (hitTest)
    hitTest: function(wx, wy) {
      if (!bgProps.dragMode || !bgImageObj || !bgProps.visible) {
        return null; 
      }

      const curW = bgProps.baseW * (bgProps.scalePct / 100);
      const curD = bgProps.baseD * (bgProps.scalePct / 100);
      const cx = bgProps.x + curW / 2;
      const cy = bgProps.y + curD / 2;
      const rad = -(bgProps.angle || 0) * Math.PI / 180;
      
      const lx = Math.cos(rad) * (wx - cx) - Math.sin(rad) * (wy - cy);
      const ly = Math.sin(rad) * (wx - cx) + Math.cos(rad) * (wy - cy);

      if (Math.abs(lx) <= curW / 2 && Math.abs(ly) <= curD / 2) {
        return { 
          type: 'bg_image', 
          offsetX: wx - bgProps.x, 
          offsetY: wy - bgProps.y 
        };
      }
      return null;
    },

    handleDrag: function(a, b, c) {
      let target, wx, wy;
      if (a && a.type === 'bg_image') {
        target = a; wx = b; wy = c;
      } else if (c && c.type === 'bg_image') {
        wx = a; wy = b; target = c;
      } else {
        return false;
      }

      bgProps.x = Math.round(wx - target.offsetX);
      bgProps.y = Math.round(wy - target.offsetY);
      triggerRender();
      return true;
    },

    handleDragEnd: function(target) {
      if (target && target.type === 'bg_image') {
        triggerSave();
        return true;
      }
      return false;
    },

    // 5. データ入出力
    exportData: function() {
      return {
        bgProps: { ...bgProps },
        imageSrc: bgImageObj ? bgImageObj.src : null
      };
    },

    importData: function(data) {
      if (!data) return;
      if (data.bgProps) {
        bgProps = { ...bgProps, ...data.bgProps };
        
        const vis = document.getElementById('bgVisible');
        if (vis) vis.checked = bgProps.visible;
        
        const op = document.getElementById('bgOpacity');
        if (op) {
          op.value = bgProps.opacity;
          const opVal = document.getElementById('bgOpacityVal');
          if (opVal) opVal.innerText = `${Math.round(bgProps.opacity * 100)}%`;
        }
        
        const scaleSlider = document.getElementById('bgScaleSlider');
        if (scaleSlider) {
          scaleSlider.value = bgProps.scalePct;
          const scVal = document.getElementById('bgScaleVal');
          if (scVal) scVal.innerText = `${Math.round(bgProps.scalePct)}%`;
        }
        
        const angleSlider = document.getElementById('bgAngleSlider');
        if (angleSlider) {
          angleSlider.value = bgProps.angle;
          const angVal = document.getElementById('bgAngleVal');
          if (angVal) angVal.innerText = `${Math.round(bgProps.angle)}°`;
        }
        
        const btnDrag = document.getElementById('btnBgDrag');
        if (btnDrag) {
          btnDrag.innerText = bgProps.dragMode ? '🖐️ 図面ドラッグ移動モード: ON' : '🖐️ 図面ドラッグ移動モード: OFF';
          if (bgProps.dragMode) {
            btnDrag.classList.add('active');
            btnDrag.style.background = '#2563eb';
            btnDrag.style.color = '#ffffff';
          } else {
            btnDrag.classList.remove('active');
            btnDrag.style.background = '';
            btnDrag.style.color = '';
          }
        }
      }
      
      if (data.imageSrc) {
        const img = new Image();
        img.onload = () => {
          bgImageObj = img;
          triggerRender();
        };
        img.src = data.imageSrc;
      } else {
        bgImageObj = null;
      }
    }
  };

  window.tabBgImageModule = BgImageModule;
  window.tabBgimageModule = BgImageModule;

  // コアエンジンの描画サイクルをハッキングして最前面にオーバーレイする処理
  let engineHooked = false;
  function hookEngineForOverlay() {
    if (engineHooked) return;
    if (typeof window.renderTopPlanTo === 'function') {
      const origRender = window.renderTopPlanTo;
      window.renderTopPlanTo = function(tCtx) {
        origRender.call(this, tCtx);
        if (window.tabBgImageModule && typeof window.tabBgImageModule.drawOverlay === 'function') {
          window.tabBgImageModule.drawOverlay(tCtx);
        }
      };
      engineHooked = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      BgImageModule.initUI();
      hookEngineForOverlay();
    });
  } else {
    BgImageModule.initUI();
    hookEngineForOverlay();
  }

  const hookInterval = setInterval(() => {
    if (typeof window.renderTopPlanTo === 'function' && !engineHooked) {
      hookEngineForOverlay();
    }
    if (engineHooked) clearInterval(hookInterval);
  }, 200);

})();