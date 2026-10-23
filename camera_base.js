/**
 * camera_base.js
 * カメラ機材仕様データ・台数管理・台座（イントレ）配置管理モジュール
 */
window.CameraBase = (function () {
  'use strict';

  // 1. 機材プリセット定義（センサーサイズ、光学ズーム倍率、画角FOV限界）[cite: 1, 3, 6]
  const CAMERA_MODELS = {
    nx5r: {
      name: 'Sony HXR-NX5R (光学20倍)',
      sensor: '1/2.8型 3CMOS',
      zoom: '光学20倍',
      minFov: 3.6,
      maxFov: 64.5
    },
    eng_std: {
      name: 'ENG 2/3型 標準22倍',
      sensor: '2/3型',
      zoom: '光学22倍',
      minFov: 2.8,
      maxFov: 58.0
    },
    eng_ext: {
      name: 'ENG 2/3型 (2x Ext)',
      sensor: '2/3型 (2x エクステンダー内蔵)',
      zoom: '光学44倍相当',
      minFov: 1.4,
      maxFov: 30.0
    },
    box_tele: {
      name: '大型ボックス40倍 (超望遠)',
      sensor: '2/3型',
      zoom: '光学40倍',
      minFov: 0.8,
      maxFov: 40.0
    },
    manual: {
      name: 'マニュアル (広角〜望遠)',
      sensor: '汎用',
      zoom: 'マニュアル',
      minFov: 0.5,
      maxFov: 120.0
    }
  };

  // 2. カメラリスト初期データ[cite: 1, 3]
  let cameras = [
    {
      id: 'CAM1',
      name: 'CAM 1',
      model: 'nx5r',
      x: 7000,
      y: 19000,
      z: 0,
      lensH: 1700,
      platW: 1000,
      platD: 1000,
      platH: 400,
      pan: 0,
      tilt: 0,
      fov: 40,
      shotType: 'stage_ff',
      targetGuestId: ''
    }
  ];

  // 選択中カメラID[cite: 1, 3]
  let selectedCamId = 'CAM1';

  /**
   * 配列を安全に取得するヘルパー関数
   * @param {Array|Object} data 
   * @returns {Array}
   */
  function getSafeArray(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      if (Array.isArray(data.list)) return data.list;
      if (Array.isArray(data.seats)) return data.seats;
    }
    return [];
  }

  /**
   * 全カメラのリストを取得
   * @returns {Array<Object>}
   */
  function getAll() {
    return cameras;
  }

  /**
   * 現在選択中のカメラを取得
   * @returns {Object|null}
   */
  function getSelected() {
    return cameras.find(c => c.id === selectedCamId) || cameras[0] || null;
  }

  /**
   * 選択中カメラIDの設定
   * @param {string} id
   */
  function setSelectedId(id) {
    selectedCamId = id;
  }

  /**
   * 新規カメラを追加し、選択状態にする[cite: 6]
   * @param {number} [roomW=14000] 
   * @param {number} [stageY=1200] 
   * @param {number} [stageD=3000] 
   * @returns {Object} 追加したカメラオブジェクト
   */
  function addCamera(roomW = 14000, stageY = 1200, stageD = 3000) {
    const num = cameras.length + 1;
    const newCam = {
      id: 'CAM' + Date.now(),
      name: `CAM ${num}`,
      model: 'nx5r',
      x: Math.round(roomW / 2),
      y: Math.round(stageY + stageD + 10000),
      z: 0,
      lensH: 1650,
      platW: 1000,
      platD: 1000,
      platH: 400,
      pan: 0,
      tilt: 0,
      fov: 40,
      shotType: 'stage_ff',
      targetGuestId: ''
    };
    cameras.push(newCam);
    selectedCamId = newCam.id;
    return newCam;
  }

  /**
   * 選択中のカメラを削除する[cite: 6]
   */
  function deleteSelected() {
    cameras = cameras.filter(c => c.id !== selectedCamId);
    if (cameras.length > 0) {
      selectedCamId = cameras[0].id;
    } else {
      selectedCamId = null;
    }
  }

  /**
   * 指定カメラを客席最後尾からの指定距離で自動配置[cite: 6]
   * @param {Object} cam - カメラオブジェクト
   * @param {number} distFromLastRow - 最後尾席からの距離 (mm)[cite: 6]
   * @param {Array|Object} rawSeats - 客席データ（配列または {list: []} 等）
   * @param {number} [chairD=480] - 椅子の奥行き (mm)[cite: 2]
   */
  function alignFromLastRow(cam, distFromLastRow, rawSeats, chairD = 480) {
    if (!cam) return;
    const dist = parseFloat(distFromLastRow) || 2000;
    const seatList = getSafeArray(rawSeats);
    
    let lastRowY = 15000;
    if (seatList.length > 0) {
      lastRowY = Math.max(...seatList.map(s => s.y)) + (chairD / 2);
    }

    const platD = cam.platD || 1000;
    cam.y = Math.round(lastRowY + dist + platD / 2);
  }

  /**
   * 外部データのインポート[cite: 6]
   * @param {Array|Object} data - カメラ配列または {list: []} 形式のデータ
   */
  function importData(data) {
    const arr = getSafeArray(data);
    cameras = JSON.parse(JSON.stringify(arr));
    
    if (cameras.length > 0) {
      if (!cameras.some(c => c.id === selectedCamId)) {
        selectedCamId = cameras[0].id;
      }
    } else {
      selectedCamId = null;
    }
  }

  /**
   * データのディープコピーをエクスポート[cite: 6]
   * @returns {Array<Object>}
   */
  function exportData() {
    return JSON.parse(JSON.stringify(cameras));
  }

  // 3. 後続スクリプト向け公開API[cite: 6]
  return {
    CAMERA_MODELS,
    getAll,
    getSelected,
    setSelectedId,
    addCamera,
    deleteSelected,
    alignFromLastRow,
    importData,
    exportData
  };
})();