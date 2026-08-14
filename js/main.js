/* =========================================================
   PureWireless — interacciones
   ========================================================= */
(function () {
  'use strict';

  /* ---------- nav: sombra al hacer scroll ---------- */
  var nav = document.getElementById('nav');
  var onScroll = function () {
    nav.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- nav: menú móvil ---------- */
  var burger = document.getElementById('burger');
  var links = document.getElementById('navLinks');

  burger.addEventListener('click', function () {
    var open = links.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  });

  links.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      links.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------- pestañas ---------- */
  var CAMERA_COPY = {
    s22: "Fotos de otro nivel, pa' que guardes cada momento.",
    ip14: 'Modo cine, retratos nítidos y video que se ve profesional.',
    edge: 'Gran angular, noche clara y colores que se ven reales.'
  };

  var PHONES = {
    s22: { src: 'images/s22.webp', alt: 'Galaxy S22 Ultra en vista 360 grados' },
    ip14: { src: 'images/iphone14.webp', alt: 'iPhone 14 Pro en vista 360 grados' },
    edge: { src: 'images/edge40.webp', alt: 'Motorola Edge 40 en vista 360 grados' }
  };

  var cameraText = document.querySelector('[data-panel-text="camaras"]');
  var cards = Array.prototype.slice.call(document.querySelectorAll('#catalogCards .card'));
  var viewerImg = document.getElementById('viewerImg');

  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var name = group.getAttribute('data-tabs');

    group.addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (!tab || tab.classList.contains('is-active')) return;

      group.querySelectorAll('.tab').forEach(function (t) {
        t.classList.toggle('is-active', t === tab);
      });

      var key = tab.getAttribute('data-tab');

      if (name === 'camaras' && cameraText && CAMERA_COPY[key]) {
        fade(cameraText, function () { cameraText.textContent = CAMERA_COPY[key]; });
      }

      if (name === 'catalogo') {
        filterCards(key);
      }

      if (name === 'tresc' && viewerImg && PHONES[key]) {
        fade(viewerImg, function () {
          viewerImg.src = PHONES[key].src;
          viewerImg.alt = PHONES[key].alt;
        });
      }
    });
  });

  function fade(el, apply) {
    el.style.transition = 'opacity .25s ease';
    el.style.opacity = '0';
    setTimeout(function () {
      apply();
      el.style.opacity = '1';
    }, 220);
  }

  function filterCards(brand, initial) {
    cards.forEach(function (card) {
      var isZte = card.getAttribute('data-brand') === 'zte';
      var show = brand === 'todos' ? !isZte : card.getAttribute('data-brand') === brand;

      if (initial) {
        // En la primera pasada solo escondemos lo que no toca:
        // así la animación de entrada (.reveal) sigue funcionando.
        if (!show) card.style.display = 'none';
        return;
      }

      card.style.transition = 'opacity .3s ease, transform .3s ease';
      if (show) {
        card.style.display = '';
        requestAnimationFrame(function () {
          card.style.opacity = '1';
          card.style.transform = 'none';
        });
      } else {
        card.style.opacity = '0';
        card.style.transform = 'translateY(10px)';
        setTimeout(function () {
          if (card.style.opacity === '0') card.style.display = 'none';
        }, 300);
      }
    });
  }

  filterCards('todos', true);

  /* ---------- 360°: botón + arrastre ---------- */
  var phone = document.getElementById('viewerPhone');
  var viewer = document.getElementById('viewer');
  var spinBtn = document.getElementById('spinBtn');

  if (phone && viewer && spinBtn) {
    var angle = 0;
    var dragging = false;
    var startX = 0;
    var startAngle = 0;

    spinBtn.addEventListener('click', function () {
      phone.style.transform = '';
      phone.classList.remove('is-spinning');
      void phone.offsetWidth;
      phone.classList.add('is-spinning');
      angle = 0;
    });

    phone.addEventListener('animationend', function () {
      phone.classList.remove('is-spinning');
    });

    viewer.addEventListener('pointerdown', function (e) {
      dragging = true;
      startX = e.clientX;
      startAngle = angle;
      phone.classList.remove('is-spinning');
      viewer.setPointerCapture(e.pointerId);
    });

    viewer.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      angle = startAngle + (e.clientX - startX) * 0.35;
      angle = Math.max(-42, Math.min(42, angle));
      phone.style.transform = 'rotateY(' + angle + 'deg)';
    });

    ['pointerup', 'pointercancel'].forEach(function (evt) {
      viewer.addEventListener(evt, function () { dragging = false; });
    });
  }

  /* ---------- reveal al hacer scroll ---------- */
  var revealables = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  revealables.forEach(function (el) { io.observe(el); });
})();
