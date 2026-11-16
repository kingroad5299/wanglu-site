// 首屏光斑跟随 + 人像微位移 + 滚动入场
(function(){
  document.documentElement.className += ' js';
  var hero = document.querySelector('.hero');
  var spot = document.querySelector('.spot');
  var frame = document.querySelector('.hero-figure .frame');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if(hero && spot && !reduce){
    hero.addEventListener('pointermove', function(e){
      var r = hero.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width) * 100;
      var y = ((e.clientY - r.top) / r.height) * 100;
      spot.style.setProperty('--mx', x + '%');
      spot.style.setProperty('--my', y + '%');
      if(frame){
        var dx = (x - 50) * 0.12;
        var dy = (y - 50) * 0.10;
        frame.style.transform = 'translate3d(' + (-dx) + 'px,' + (-dy) + 'px,0)';
      }
    });
    hero.addEventListener('pointerleave', function(){
      if(frame) frame.style.transform = 'translate3d(0,0,0)';
    });
  }

  var items = document.querySelectorAll('.rev');
  if(!('IntersectionObserver' in window) || reduce){
    items.forEach(function(el){ el.classList.add('on'); });
    return;
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){
        en.target.classList.add('on');
        io.unobserve(en.target);
      }
    });
  }, {threshold:0.14, rootMargin:'0px 0px -8% 0px'});
  items.forEach(function(el, i){
    el.style.transitionDelay = ((i % 4) * 70) + 'ms';
    io.observe(el);
  });
})();
