/**
 * camera_base.js
 * カメラ機材仕様データ・台数管理・台座（イントレ）配置管理モジュール
 */
window.CameraBase = (function () {
  'use strict';

  // 1. 機材プリセット定義（センサーサイズ、光学ズーム倍率、画角FOV限界）[cite: 2, 4]
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

  // 2. カメラリスト初期データ
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

  // 選択中カメラID[cite: 2, 4]
  let selectedCamId = 'CAM1';

  /**
   * 全カメラのリストを取得[cite: 4]
   * @returns {Array<Object>}
   */
  function getAll() {
    return cameras;
  }

  /**
   * 現在選択中のカメラを取得[cite: 3, 4]
   * @returns {Object|null}
   */
  function getSelected() {
    return cameras.find(c => c.id === selectedCamId) || cameras[0] || null;
  }

  /**
   * 選択中カメラIDの取得
   * @returns {string|null}
   */
  function getSelectedId() {
    return selectedCamId;
  }

  /**
   * 選択中カメラIDの設定[cite: 4]
   * @param {string} id
   */
  function setSelectedId(id) {
    selectedCamId = id;
  }

  /**
   * 新規カメラを追加し、選択状態にする[cite: 3, 4]
   * オブジェクト指定、または (roomW, stageY, stageD) の数値指定に対応
   */
  function add(params = {}) {
    let newCam = {};
    const num = cameras.length + 1;

    if (typeof params === 'number') {
      const roomW = arguments[0] || 14000;
      const stageY = arguments[1] || 1200;
      const stageD = arguments[2] || 3000;
      newCam = {
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
    } else {
      newCam = Object.assign({
        id: 'CAM' + Date.now(),
        name: `CAM ${num}`,
        model: 'nx5r',
        x: 7000,
        y: 19000,
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
      }, params);
    }

    cameras.push(newCam);
    selectedCamId = newCam.id;
    return newCam;
  }

  /**
   * カメラの削除[cite: 2, 4]
   * @param {string} [id] - 省略時は選択中のカメラを削除
   */
  function remove(id) {
    const targetId = id || selectedCamId;
    cameras = cameras.filter(c => c.id !== targetId);
    if (selectedCamId === targetId) {
      selectedCamId = cameras.length > 0 ? cameras[0].id : null;
    }
  }

  /**
   * カメラ情報の更新
   * @param {string|Object} idOrUpdates - カメラID、または直接更新オブジェクト
   * @param {Object} [updates] - 更新内容
   */
  function update(idOrUpdates, updates) {
    let target = null;
    let data = null;

    if (typeof idOrUpdates === 'string') {
      target = cameras.find(c => c.id === idOrUpdates);
      data = updates;
    } else if (typeof idOrUpdates === 'object' && idOrUpdates !== null) {
      target = getSelected();
      data = idOrUpdates;
    }

    if (target && data && typeof data === 'object') {
      Object.assign(target, data);
    }
    return target;
  }

  /**
   * 指定カメラを客席最後尾からの指定距離で自動配置[cite: 4]
   * @param {Object} cam - カメラオブジェクト
   * @param {number} distFromLastRow - 最後尾席からの距離 (mm)[cite: 4]
   * @param {Array<Object>} seats - 客席配列[cite: 4]
   * @param {number} [chairD=480] - 椅子の奥行き (mm)[cite: 2]
   */
  function alignFromLastRow(cam, distFromLastRow, seats, chairD = 480) {
    if (!cam) return;
    const dist = parseFloat(distFromLastRow) || 2000;
    const seatList = Array.isArray(seats) ? seats : (seats && seats.list ? seats.list : []);
    
    let lastRowY = 15000;
    if (seatList.length > 0) {
      lastRowY = Math.max(...seatList.map(s => s.y)) + (chairD / 2);
    }

    const platD = cam.platD || 1000;
    cam.y = Math.round(lastRowY + dist + platD / 2);
  }

  /**
   * 外部データのインポート[cite: 4]
   * @param {Array|Object} data
   */
  function importData(data) {
    let arr = [];
    if (Array.isArray(data)) {
      arr = data;
    } else if (data && typeof data === 'object' && Array.isArray(data.list)) {
      arr = data.list;
    }
    
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
   * データのディープコピーをエクスポート[cite: 4]
   * @returns {Array<Object>}
   */
  function exportData() {
    return JSON.parse(JSON.stringify(cameras));
  }

  // 3. 後続スクリプトおよび tab7_camera.js 向けの公開API[cite: 4]
  return {
    CAMERA_MODELS,
    getAll,
    getSelected,
    getSelectedId,
    setSelectedId,
    add,
    addCamera: add,                 // tab7_camera.js との互換エイリアス[cite: 4]
    remove,
    deleteSelected: remove,         // tab7_camera.js との互換エイリアス[cite: 4]
    update,
    alignFromLastRow,
    importData,
    exportData
  };
})();