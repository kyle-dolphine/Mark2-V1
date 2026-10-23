/**
 * camera_angle.js - 会場図面 & ENG視界シミュレーター Mark2
 * カメラ角度・光学画角・視線遮蔽（前頭被り）・イントレ必要高 逆算計算モジュール
 * 
 * 外部依存関係を持たない純粋な計算エンジン (Pure Calculation Engine)
 */
window.CameraAngle = (function () {
  'use strict';

  /**
   * 客席データ(seats)の入力フォーマット差異を吸収し、安全に純粋配列を返す
   * @param {Array|Object} seats - 客席配列 または { list: [...] } 等のオブジェクト
   * @returns {Array<Object>} 客席配列
   */
  function getSeatsArray(seats) {
    if (Array.isArray(seats)) {
      return seats;
    }
    if (seats && typeof seats === 'object') {
      if (Array.isArray(seats.list)) return seats.list;
      if (Array.isArray(seats.seats)) return seats.seats;
      if (Array.isArray(seats.data)) return seats.data;
    }
    // グローバル window.seats のフォールバック
    if (typeof window !== 'undefined' && Array.isArray(window.seats)) {
      return window.seats;
    }
    return [];
  }

  /**
   * 登壇者データ(guests)の入力フォーマット差異を吸収し、安全に純粋配列を返す
   */
  function getGuestsArray(guests) {
    if (Array.isArray(guests)) {
      return guests;
    }
    if (guests && typeof guests === 'object' && Array.isArray(guests.list)) {
      return guests.list;
    }
    if (typeof window !== 'undefined' && Array.isArray(window.guests)) {
      return window.guests;
    }
    return [];
  }

  /**
   * 1. 水平画角(H-FOV)から16:9の垂直画角(V-FOV)を光学計算する
   * @param {number} hFovDeg - 水平画角 (度数法)
   * @returns {number} 垂直画角 (度数法)
   */
  function getVerticalFov(hFovDeg) {
    if (!hFovDeg || hFovDeg <= 0) return 0;
    const hRad = (hFovDeg * Math.PI) / 180;
    // 16:9 アスペクト比における光学計算: tan(V/2) = tan(H/2) * (9/16)
    const vRad = 2 * Math.atan(Math.tan(hRad / 2) * (9 / 16));
    return (vRad * 180) / Math.PI;
  }

  /**
   * 補助関数: 指定した座標がステージ矩形内にあるか判定
   */
  function isInsideStage(x, y, stage) {
    if (!stage) return false;
    return (
      x >= stage.x &&
      x <= stage.x + stage.w &&
      y >= stage.y &&
      y <= stage.y + stage.d
    );
  }

  /**
   * 2. ショットタイプに応じた自動照準点(Target)、画角(FOV)、パン/チルト角を算出
   * @param {Object} cam - カメラオブジェクト {x, y, lensH, fov, shotType, targetGuestId, pan, tilt, model}
   * @param {Object} stage - ステージ情報 {x, y, w, d, h}
   * @param {Array|Object} guests - 登壇者データ
   * @param {Object} cameraModels - カメラ機種辞書
   * @returns {Object} 照準・光学情報
   */
  function calculateAimAndFov(cam, stage, guests, cameraModels) {
    const safeCam = cam || {};
    const safeStage = stage || { x: 0, y: 0, w: 10000, d: 3000, h: 800 };
    const safeGuests = getGuestsArray(guests);

    // カメラモデルのスペック取得 (デフォルト fallback)
    const fallbackModels = {
      nx5r: { name: 'Sony HXR-NX5R', minFov: 3.6, maxFov: 64.5 },
      eng_std: { name: 'ENG 2/3型 標準22倍', minFov: 2.8, maxFov: 58.0 },
      manual: { name: 'マニュアル', minFov: 0.5, maxFov: 120.0 }
    };
    const models = cameraModels || fallbackModels;
    const modelDef = models[safeCam.model] || models.nx5r || { minFov: 2.0, maxFov: 60.0 };

    let targetX = safeStage.x + safeStage.w / 2;
    let targetY = safeStage.y + safeStage.d;
    let targetZ = safeStage.h + 1200;
    let calcFov = safeCam.fov || 40;
    let isTeleLimit = false;
    let status = 'ok';
    let reqWidth = 0;
    let dist = Math.hypot(targetX - safeCam.x, targetY - safeCam.y);

    // --- ショットタイプ別の自動エイム＆ズーム計算 ---
    if (safeCam.shotType === 'stage_ff') {
      reqWidth = safeStage.w;
      calcFov = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / Math.max(dist, 1))) * (180 / Math.PI)) + 4.0;
      targetX = safeStage.x + safeStage.w / 2;
      targetY = safeStage.y + safeStage.d;
      targetZ = safeStage.h + 2200;
      if (calcFov > modelDef.maxFov) status = 'wide_limit';

    } else if (safeCam.shotType === 'guest_group') {
      if (safeGuests.length > 0) {
        let minX = Infinity, maxX = -Infinity;
        safeGuests.forEach(g => {
          if (g.x < minX) minX = g.x;
          if (g.x > maxX) maxX = g.x;
        });
        if (minX <= maxX) {
          targetX = (minX + maxX) / 2;
          reqWidth = (maxX - minX) + 1200;
          dist = Math.hypot(targetX - safeCam.x, targetY - safeCam.y);
          calcFov = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / Math.max(dist, 1))) * (180 / Math.PI));
          if (calcFov > modelDef.maxFov) status = 'wide_limit';

          const maxGuestH = Math.max(...safeGuests.map(g => g.h || 0));
          const baseZ = isInsideStage(targetX, targetY, safeStage) ? safeStage.h : 0;
          targetZ = baseZ + maxGuestH + 200;
        }
      }

    } else if (safeCam.shotType === 'guest_single') {
      const tgt = safeGuests.find(g => g.id === safeCam.targetGuestId) || safeGuests[0];
      if (tgt) {
        targetX = tgt.x;
        targetY = tgt.y;
        dist = Math.hypot(tgt.x - safeCam.x, tgt.y - safeCam.y);
        reqWidth = 800; // バスト〜ウエスト想定
        const idealDeg = Math.max(0.5, (2 * Math.atan((reqWidth / 2) / Math.max(dist, 1))) * (180 / Math.PI));

        if (idealDeg < modelDef.minFov) {
          calcFov = modelDef.minFov;
          isTeleLimit = true;
          status = 'tele_limit';
        } else if (idealDeg > modelDef.maxFov) {
          calcFov = modelDef.maxFov;
          status = 'wide_limit';
        } else {
          calcFov = idealDeg;
        }
        const baseZ = isInsideStage(tgt.x, tgt.y, safeStage) ? safeStage.h : 0;
        targetZ = baseZ + (tgt.h || 1200) - 150;
      }
    }

    // 機種に応じた光学画角リミット制御
    if (safeCam.shotType !== 'manual' && safeCam.shotType !== 'manual_angle') {
      calcFov = Math.min(modelDef.maxFov, Math.max(modelDef.minFov, calcFov));
      safeCam.fov = calcFov;
    }

    // 水平角(Angle/Pan)・チルト角(Tilt)の幾何計算
    let hAngle = Math.atan2(targetY - safeCam.y, targetX - safeCam.x);
    let panDeg = (hAngle * 180) / Math.PI + 90;
    const groundDist = Math.hypot(targetX - safeCam.x, targetY - safeCam.y);
    let tiltDeg = Math.atan2(targetZ - (safeCam.lensH || 0), Math.max(groundDist, 1)) * (180 / Math.PI);

    // 手動アングル指定モード時
    if (safeCam.shotType === 'manual_angle') {
      panDeg = safeCam.pan || 0;
      tiltDeg = safeCam.tilt || 0;
      hAngle = (-90 + panDeg) * (Math.PI / 180);
      const tiltRad = tiltDeg * (Math.PI / 180);
      const lookDist = 10000;
      targetX = safeCam.x + lookDist * Math.cos(hAngle);
      targetY = safeCam.y + lookDist * Math.sin(hAngle);
      targetZ = (safeCam.lensH || 0) + lookDist * Math.tan(tiltRad);
      calcFov = safeCam.fov;
    }

    const vFov = getVerticalFov(calcFov);

    return {
      angle: hAngle,
      hAngle: hAngle,
      panDeg: panDeg,
      tiltDeg: tiltDeg,
      fov: calcFov,
      vFov: vFov,
      targetX: targetX,
      targetY: targetY,
      targetZ: targetZ,
      isTeleLimit: isTeleLimit,
      status: status,
      modelDef: modelDef,
      reqWidth: reqWidth,
      dist: dist
    };
  }

  /**
   * 3. カメラレンズからターゲットへの視線レイと客席頭頂高の干渉（前頭被り）客席配列を抽出
   * @param {Object} cam - カメラオブジェクト {x, y, lensH}
   * @param {Object} aimInfo - calculateAimAndFov の戻り値
   * @param {Array|Object} seats - 客席配列 または { list: [...] }
   * @param {number} [headZ=1270] - 客席着席時の頭頂高 (mm)
   * @returns {Array<Object>} 視線を遮蔽している客席オブジェクトの配列
   */
  function checkHeadBlock(cam, aimInfo, seats, headZ = 1270) {
    const seatList = getSeatsArray(seats);
    const blockedSeats = [];
    if (!cam || !aimInfo || seatList.length === 0) {
      return blockedSeats;
    }

    const effectiveHeadZ = (typeof headZ === 'number' && !isNaN(headZ))
      ? headZ
      : ((typeof window !== 'undefined' && window.totalHeadZ) || 1270);

    const camZ = cam.lensH || 1600;
    const tgtZ = typeof aimInfo.targetZ === 'number' ? aimInfo.targetZ : 1200;
    const dy = aimInfo.targetY - cam.y;

    if (Math.abs(dy) < 1e-4) return blockedSeats;

    seatList.forEach(s => {
      if (!s) return;
      // カメラより前かつ被写体より後ろに存在する客席のみを検査
      const isBetweenY = (cam.y > aimInfo.targetY)
        ? (s.y < cam.y && s.y > aimInfo.targetY)
        : (s.y > cam.y && s.y < aimInfo.targetY);

      if (isBetweenY) {
        const t = (s.y - cam.y) / dy;
        if (t > 0 && t < 1) {
          const rayXAtSeat = cam.x + t * (aimInfo.targetX - cam.x);
          const rayZAtSeat = camZ + t * (tgtZ - camZ);

          // 視線レイから左右160mm（頭部幅マージン）かつ視線高度が頭頂高を下回る場合
          if (Math.abs(s.x - rayXAtSeat) < 160 && rayZAtSeat < effectiveHeadZ) {
            blockedSeats.push(s);
          }
        }
      }
    });

    return blockedSeats;
  }

  /**
   * 4. 頭被り見切れ判定 & 被り回避のためのイントレ台/レンズ必要高さ逆算シミュレーション
   * @param {Object} cam - カメラオブジェクト {x, y, lensH}
   * @param {Object} aimInfo - calculateAimAndFov の戻り値
   * @param {Array|Object} seats - 客席配列 または { list: [...] }
   * @param {number} [headZ=1270] - 客席着席時の頭頂高 (mm)
   * @param {number} [clearanceMargin=50] - 視線と頭頂の安全離隔マージン (mm)
   * @returns {Object} { isBlocked, blockedSeats, blockedCount, currentLensH, requiredLensH, neededHeightDelta, headZ, worstSeat }
   */
  function simulateHeightClearance(cam, aimInfo, seats, headZ = 1270, clearanceMargin = 50) {
    const seatList = getSeatsArray(seats);
    const effectiveHeadZ = (typeof headZ === 'number' && !isNaN(headZ))
      ? headZ
      : ((typeof window !== 'undefined' && window.totalHeadZ) || 1270);

    const safeCam = cam || {};
    const camZ = safeCam.lensH || 1600;
    const tgtZ = (aimInfo && typeof aimInfo.targetZ === 'number') ? aimInfo.targetZ : 1200;
    const dy = (aimInfo && typeof aimInfo.targetY === 'number') ? (aimInfo.targetY - safeCam.y) : 0;

    let maxReqLensH = camZ;
    let worstSeat = null;
    const blockedSeats = [];

    if (aimInfo && Math.abs(dy) >= 1e-4 && seatList.length > 0) {
      seatList.forEach(s => {
        if (!s) return;
        const isBetweenY = (safeCam.y > aimInfo.targetY)
          ? (s.y < safeCam.y && s.y > aimInfo.targetY)
          : (s.y > safeCam.y && s.y < aimInfo.targetY);

        if (isBetweenY) {
          const t = (s.y - safeCam.y) / dy;
          if (t > 0 && t < 1) {
            const rayXAtSeat = safeCam.x + t * (aimInfo.targetX - safeCam.x);
            const rayZAtSeat = camZ + t * (tgtZ - camZ);

            // 左右160mm（頭部幅）以内にある席
            if (Math.abs(s.x - rayXAtSeat) < 160) {
              if (rayZAtSeat < effectiveHeadZ) {
                blockedSeats.push(s);
              }

              // 幾何逆算: rayZ(t) = (1 - t) * reqCamZ + t * tgtZ >= effectiveHeadZ + clearanceMargin
              // reqCamZ >= ((effectiveHeadZ + clearanceMargin) - t * tgtZ) / (1 - t)
              const reqCamZForSeat = ((effectiveHeadZ + clearanceMargin) - t * tgtZ) / (1 - t);
              if (reqCamZForSeat > maxReqLensH) {
                maxReqLensH = reqCamZForSeat;
                worstSeat = s;
              }
            }
          }
        }
      });
    }

    const neededHeightDelta = Math.max(0, Math.ceil(maxReqLensH - camZ));

    return {
      isBlocked: blockedSeats.length > 0,
      blockedSeats: blockedSeats,
      blockedCount: blockedSeats.length,
      currentLensH: camZ,
      requiredLensH: Math.ceil(maxReqLensH),
      neededHeightDelta: neededHeightDelta,
      headZ: effectiveHeadZ,
      worstSeat: worstSeat
    };
  }

  /**
   * 5. カメラ設定・視界クリアランス判定のサマリーテキストを生成
   * @param {Object} cam - カメラオブジェクト
   * @param {Object} aimInfo - calculateAimAndFov の戻り値
   * @param {Object} [clearanceResult] - simulateHeightClearance の戻り値
   * @returns {string} サマリー文字列
   */
  function generateSummaryText(cam, aimInfo, clearanceResult) {
    if (!cam || !aimInfo) return 'カメラ情報がありません';

    const shotTypeMap = {
      stage_ff: 'ステージ全景 (FF)',
      guest_group: '登壇者集合',
      guest_single: '単一登壇者',
      manual: '手動ズーム',
      manual_angle: '手動アングル'
    };

    const shotName = shotTypeMap[cam.shotType] || cam.shotType || '標準';
    const pan = aimInfo.panDeg !== undefined ? aimInfo.panDeg.toFixed(1) + '°' : '-';
    const tilt = aimInfo.tiltDeg !== undefined ? aimInfo.tiltDeg.toFixed(1) + '°' : '-';
    const fov = aimInfo.fov !== undefined ? aimInfo.fov.toFixed(1) + '°' : '-';
    const vFov = aimInfo.vFov !== undefined ? aimInfo.vFov.toFixed(1) + '°' : '-';

    let summary = `【${cam.name || cam.id || 'カメラ'}】\n`;
    summary += `・ショットタイプ: ${shotName}\n`;
    summary += `・画角: H-FOV ${fov} / V-FOV(16:9) ${vFov}\n`;
    summary += `・アングル: パン ${pan} / チルト ${tilt}\n`;

    if (clearanceResult) {
      if (clearanceResult.isBlocked) {
        summary += `・視界判定: ⚠️ 前頭被りあり (${clearanceResult.blockedCount} 席が干渉)\n`;
        summary += `・対策: イントレ台/レンズ高さをあと +${clearanceResult.neededHeightDelta} mm (推奨高: ${clearanceResult.requiredLensH} mm) 上げる必要があります。`;
      } else {
        summary += `・視界判定: ✅ クリア (前列頭部の干渉なし)`;
      }
    }

    return summary;
  }

  // 外部公開インターフェース
  return {
    getVerticalFov: getVerticalFov,
    calculateAimAndFov: calculateAimAndFov,
    checkHeadBlock: checkHeadBlock,
    simulateHeightClearance: simulateHeightClearance,
    generateSummaryText: generateSummaryText
  };
})();