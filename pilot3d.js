/* 首屏 3D 人物 —— 载入 GLB 角色模型（Vanguard，科幻作战装具，含 Idle 待机动画）
   · 真实网格 + PBR 贴图，程序化环境贴图提供金属反射
   · 拖拽旋转 / 鼠标视差 / 自动轻微摆动；加载期间显示占位，失败回落静态照片 */
(function () {
  var holder = document.getElementById('pilot3d');
  var canvas = document.getElementById('pilot-canvas');
  if (!holder || !canvas || !window.THREE) { if (holder) holder.classList.add('no3d'); return; }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (e) { holder.classList.add('no3d'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);

  /* ============ 程序化环境贴图（棚拍反射） ============ */
  var envTex = (function () {
    var c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    var g = c.getContext('2d');
    var lin = g.createLinearGradient(0, 0, 0, 512);
    lin.addColorStop(0, '#2a3441');
    lin.addColorStop(0.5, '#0b1016');
    lin.addColorStop(1, '#04060a');
    g.fillStyle = lin; g.fillRect(0, 0, 1024, 512);
    function blob(x, y, r, col) {
      var rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    blob(220, 105, 250, 'rgba(255,248,236,1)');
    blob(780, 145, 220, 'rgba(255,170,72,.55)');
    blob(520, 400, 280, 'rgba(110,165,220,.30)');
    blob(940, 330, 170, 'rgba(215,232,248,.28)');
    var t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    if (THREE.PMREMGenerator) {
      var pm = new THREE.PMREMGenerator(renderer);
      var rt = pm.fromEquirectangular(t); pm.dispose(); return rt.texture;
    }
    return t;
  })();
  scene.environment = envTex;

  /* ============ 灯光 ============ */
  scene.add(new THREE.HemisphereLight(0x9fb3c7, 0x0c1116, 0.55));
  var key = new THREE.DirectionalLight(0xfff2e2, 1.05);
  key.position.set(2.0, 3.2, 2.4);
  scene.add(key);
  var rimL = new THREE.PointLight(0xff8c2a, 2.4, 6.0, 2);
  rimL.position.set(-1.6, 1.6, -1.4);
  scene.add(rimL);
  var rimR = new THREE.PointLight(0x74a2da, 1.7, 6.5, 2);
  rimR.position.set(1.9, 1.1, -1.2);
  scene.add(rimR);
  var fill = new THREE.PointLight(0xe8f0f8, 0.6, 4.5, 2);
  fill.position.set(-0.4, 1.2, 1.9);
  scene.add(fill);

  /* ============ 转台光环 ============ */
  var ringPivot = new THREE.Group();
  scene.add(ringPivot);
  var ringA = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.0035, 6, 96),
    new THREE.MeshBasicMaterial({ color: 0xd6a54a, transparent: true, opacity: 0.45 }));
  ringA.rotation.x = Math.PI / 2; ringA.position.y = -0.55;
  ringPivot.add(ringA);
  var ringB = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.0030, 6, 96),
    new THREE.MeshBasicMaterial({ color: 0x9db2c6, transparent: true, opacity: 0.16 }));
  ringB.rotation.x = Math.PI / 2; ringB.position.y = -0.54;
  ringPivot.add(ringB);

  // 接地阴影 + 地面微光
  (function () {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g2 = c.getContext('2d');
    var grad = g2.createRadialGradient(64, 64, 2, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,.55)');
    grad.addColorStop(.55, 'rgba(0,0,0,.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.002;
    scene.add(sh);
  })();

  /* ============ 载入模型 ============ */
  var pilot = new THREE.Group();
  scene.add(pilot);
  var mixer = null, idleAction = null, ready = false;

  var mh = 1.78, mw = 1.2;

  /* 按模型真实尺寸 + 卡片宽高比反算相机距离，保证头脚都在框内 */
  function frame() {
    var half = Math.tan(camera.fov * Math.PI / 360);
    var dz = (mh / 2 * 1.16) / (half * 0.95);
    var dx = (mw / 2 * 1.22) / (half * Math.max(camera.aspect, 0.4) * 0.95);
    var z = Math.max(dz, dx, mh * 0.95);
    camera.position.set(0, mh * 0.53, z);
    camera.lookAt(0, mh * 0.5, 0);
    camera.updateProjectionMatrix();
  }

  function onLoaded(gltf) {
    var model = gltf.scene;
    // 归一化尺寸：头顶高度对齐到 1.78m
    var box = new THREE.Box3().setFromObject(model);
    var h = box.max.y - box.min.y;
    var s = 1.78 / (h || 1);
    model.scale.setScalar(s);
    box.setFromObject(model);
    var size = box.getSize(new THREE.Vector3());
    mh = size.y; mw = Math.max(size.x, size.z * 1.7);
    model.position.y -= box.min.y;
    model.position.x -= (box.max.x + box.min.x) / 2;
    model.position.z -= (box.max.z + box.min.z) / 2;
    model.rotation.y = Math.PI;   // 面向镜头（模型默认朝 -Z）
    pilot.add(model);

    model.traverse(function (o) {
      if (o.isMesh) {
        o.material.envMapIntensity = 1.15;
        if (o.material.map) o.material.map.anisotropy = 4;
        o.frustumCulled = false;
      }
    });

    if (gltf.animations && gltf.animations.length && THREE.AnimationMixer) {
      mixer = new THREE.AnimationMixer(model);
      var clip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0];
      idleAction = mixer.clipAction(clip);
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.timeScale = 0.85;
      idleAction.play();
    }
    ready = true;
    window.__dbg = { pilot: pilot, cam: camera, scene: scene, THREE: THREE, model: model, holder: holder, renderer: renderer, frame: frame, canvas: canvas };
    holder.classList.remove('loading'); holder.classList.add('ready');
    frame();
    tick();
  }

  /* 分块下载：单条连接被中途重置时只重试那一块，避免整包失败 */
  function loadGLB(url, done, fail) {
    var CHUNK = 131072, parts = [], total = 0;
    function prog(n) {
      if (total) holder.style.setProperty('--load', Math.round(n / total * 100) + '%');
    }
    function grab(start, end, tries) {
      fetch(url, { headers: { Range: 'bytes=' + start + '-' + end } })
        .then(function (r) {
          if (r.status !== 206 && r.status !== 200) throw new Error('HTTP ' + r.status);
          var cr = r.headers.get('Content-Range');
          if (cr) { var m = /\/(\d+)/.exec(cr); if (m) total = parseInt(m[1], 10); }
          return r.arrayBuffer();
        })
        .then(function (buf) {
          if (!buf.byteLength) throw new Error('empty');
          parts.push(new Uint8Array(buf));
          if (buf.byteLength > end - start + 1) return assemble();  // 服务端忽略 Range，直接返回整包
          var next = start + buf.byteLength;
          prog(next);
          if (total && next >= total) return assemble();
          if (!total && buf.byteLength < CHUNK) return assemble();
          return grab(next, next + CHUNK - 1, 6);
        })
        .catch(function (e) {
          if (tries > 0) return setTimeout(function () { grab(start, end, tries - 1); }, 300 + (6 - tries) * 250);
          fail(e);
        });
    }
    function assemble() {
      var n = parts.reduce(function (a, p) { return a + p.byteLength; }, 0), out = new Uint8Array(n), o = 0;
      parts.forEach(function (p) { out.set(p, o); o += p.byteLength; });
      done(out.buffer);
    }
    grab(0, CHUNK - 1, 6);
  }

  function failAll() { holder.classList.add('no3d'); holder.classList.remove('loading'); }

  if (!holder.classList.contains('ready')) holder.classList.add('loading');
  if (THREE.GLTFLoader) {
    var loader = new THREE.GLTFLoader();
    if (THREE.DRACOLoader) {
      var dl = new THREE.DRACOLoader();
      dl.setDecoderPath('assets/draco/');
      try { dl.setDecoderConfig({ type: 'wasm' }); } catch (e) {}
      loader.setDRACOLoader(dl);
    }
    loadGLB('assets/vanguard.glb', function (buf) {
      loader.parse(buf, 'assets/', onLoaded, function () { failAll(); });
    }, function () {
      // 分块失败再退回普通整包请求，最多 4 次（CDN 偶发截断）
      var att = 0;
      (function whole() {
        att++;
        loader.load('assets/vanguard.glb' + (att > 1 ? '?r=' + Date.now() : ''), onLoaded, null, function () {
          if (att < 4) return setTimeout(whole, 600);
          failAll();
        });
      })();
    });
  } else {
    holder.classList.add('no3d');
  }

  /* ============ 交互 ============ */
  var targetYaw = 0, yaw = 0, dragYaw = 0, dragging = false, lastX = 0, pointerY = 0;
  function down(e) { dragging = true; lastX = (e.touches ? e.touches[0].clientX : e.clientX); }
  function move(e) {
    var x = (e.touches ? e.touches[0].clientX : e.clientX);
    if (dragging) {
      dragYaw = Math.max(-1.15, Math.min(1.15, dragYaw + (x - lastX) * 0.006));
      lastX = x;
    }
    var cy = (e.clientY !== undefined) ? e.clientY : (e.touches ? e.touches[0].clientY : 0);
    var r = canvas.getBoundingClientRect();
    pointerY = (cy - r.top) / r.height - 0.5;
  }
  function up() { dragging = false; }
  canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: true });
  canvas.addEventListener('touchend', up);

  function resize() {
    var w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (ready) frame();
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  var clock = new THREE.Clock(), visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(holder);
  }
  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    var t = clock.getElapsedTime();
    if (mixer) mixer.update(0.0165);
    targetYaw = Math.sin(t * 0.30) * 0.22 + dragYaw;
    yaw += (targetYaw - yaw) * 0.06;
    pilot.rotation.y = yaw;
    pilot.rotation.x = pointerY * 0.02;
    pilot.position.y = Math.sin(t * 0.7) * 0.006;
    ringPivot.rotation.z = t * 0.05;
    renderer.render(scene, camera);
  }
})();
