/* ─── Motion Effects Library ────────────────────────────────────────── */
/* Skiper UI-inspired interactions — vanilla JS + CSS-powered         */

(function () {
  'use strict';

  // ─── Cursor Tilt Effect ──────────────────────────────────────────────
  // Gives cards a subtle 3D tilt following mouse movement
  function initTilt(selector, opts) {
    opts = opts || {};
    var maxTilt = opts.maxTilt || 6;
    var perspective = opts.perspective || 800;
    var scale = opts.scale || 1.01;
    var transition = opts.transition || 250;
    var els = document.querySelectorAll(selector);

    els.forEach(function (el) {
      el.style.transformStyle = 'preserve-3d';
      el.style.willChange = 'transform';

      el.addEventListener('mousemove', function (e) {
        var rect = el.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;

        el.style.transition = 'none';
        el.style.transform =
          'perspective(' + perspective + 'px) ' +
          'rotateX(' + (-y * maxTilt) + 'deg) ' +
          'rotateY(' + (x * maxTilt) + 'deg) ' +
          'scale3d(' + scale + ', ' + scale + ', ' + scale + ')';
      });

      el.addEventListener('mouseleave', function () {
        el.style.transition = 'transform ' + transition + 'ms cubic-bezier(0.32, 0.72, 0, 1)';
        el.style.transform = 'perspective(' + perspective + 'px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
      });
    });
  }

  // ─── Magnetic Button Effect ──────────────────────────────────────────
  // Buttons slightly follow the cursor position within their bounds
  function initMagnetic(selector, opts) {
    opts = opts || {};
    var strength = opts.strength || 0.25;
    var transition = opts.transition || 200;
    var els = document.querySelectorAll(selector);

    els.forEach(function (btn) {
      btn.style.willChange = 'transform';
      btn.style.transition = 'transform ' + transition + 'ms cubic-bezier(0.32, 0.72, 0, 1)';

      btn.addEventListener('mousemove', function (e) {
        var rect = btn.getBoundingClientRect();
        var x = (e.clientX - rect.left - rect.width / 2) * strength;
        var y = (e.clientY - rect.top - rect.height / 2) * strength;
        btn.style.transition = 'none';
        btn.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      });

      btn.addEventListener('mouseleave', function () {
        btn.style.transition = 'transform ' + transition + 'ms cubic-bezier(0.32, 0.72, 0, 1)';
        btn.style.transform = '';
      });
    });
  }

  // ─── Animated Counter ────────────────────────────────────────────────
  // Counts up from 0 to target when element scrolls into view
  // Use: <span class="motion-counter" data-target="99.9" data-suffix="%" data-duration="2000" data-decimals="1">0</span>
  function initCounters(selector) {
    var els = document.querySelectorAll(selector || '.motion-counter');
    if (!els.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          observer.unobserve(el);

          var target = parseFloat(el.getAttribute('data-target'));
          var suffix = el.getAttribute('data-suffix') || '';
          var prefix = el.getAttribute('data-prefix') || '';
          var duration = parseInt(el.getAttribute('data-duration')) || 2000;
          var decimals = parseInt(el.getAttribute('data-decimals')) || 0;
          var start = parseFloat(el.getAttribute('data-start')) || 0;
          if (isNaN(target)) return;

          var startTime = performance.now();

          function update(now) {
            var elapsed = now - startTime;
            var progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = start + (target - start) * eased;
            el.textContent = prefix + current.toFixed(decimals) + suffix;
            if (progress < 1) requestAnimationFrame(update);
          }
          requestAnimationFrame(update);
        });
      },
      { threshold: 0.4 }
    );

    els.forEach(function (el) { observer.observe(el); });
  }

  // ─── Scroll-Driven Parallax ──────────────────────────────────────────
  // Elements move at a different speed than the scroll
  function initParallax(selector, opts) {
    opts = opts || {};
    var speed = opts.speed || 0.15;
    var els = document.querySelectorAll(selector);
    if (!els.length) return;

    var ticking = false;

    function update() {
      els.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var viewportHeight = window.innerHeight;
        var scrollProgress = 1 - (rect.top + rect.height / 2) / (viewportHeight + rect.height);
        var offset = (scrollProgress - 0.5) * speed * 200;
        el.style.transform = 'translateY(' + offset.toFixed(1) + 'px)';
      });
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  // ─── Scroll-Driven Opacity Transform (Spring Reveal) ────────────────
  // Similar to reveal-spring but tracks scroll position for smooth effect.
  // Content must NEVER stay hidden: the reveal only hides *while animating*,
  // so reduced-motion users and elements the observer misses (e.g. revealed
  // from a display:none view on a tab switch) are force-revealed.
  function initScrollReveal(selector, opts) {
    opts = opts || {};
    var threshold = opts.threshold || 0.08;
    var els = document.querySelectorAll(selector || '.reveal-spring');
    if (!els.length) return;

    // Reduced motion: reveal instantly, no animation.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(function (el) { el.classList.add('visible'); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: threshold, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach(function (el) { observer.observe(el); });

    // Safety net: IntersectionObserver can miss elements that were inside a
    // display:none container when observed (tab views) or that were already
    // on screen. Reveal anything still hidden shortly after init — either it
    // is on screen (missed callback) or it lives in a hidden view that will
    // be shown later (e.g. a tab switch), where it must appear instantly.
    setTimeout(function () {
      els.forEach(function (el) {
        if (el.classList.contains('visible')) return;
        var rect = el.getBoundingClientRect();
        var rendered = rect.width > 0 || rect.height > 0;
        if (!rendered || (rect.top < window.innerHeight && rect.bottom > 0)) {
          el.classList.add('visible');
        }
      });
    }, 900);
  }

  // ─── Smooth Background Shift Based on Scroll ─────────────────────────
  function initBgShift(opts) {
    opts = opts || {};
    var el = opts.el || document.querySelector('[data-bg-shift]');
    if (!el) return;

    var startColor = opts.startColor || getComputedStyle(el).backgroundImage || 'none';
    var ticking = false;

    function update() {
      var scrollY = window.scrollY;
      var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      var progress = Math.min(scrollY / maxScroll, 1);
      // Subtle shift — we use brightness/opacity of a pseudo element
      el.style.setProperty('--scroll-progress', progress.toFixed(3));
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  // ─── Export ──────────────────────────────────────────────────────────
  window.MotionEffects = {
    tilt: initTilt,
    magnetic: initMagnetic,
    counters: initCounters,
    parallax: initParallax,
    scrollReveal: initScrollReveal,
    bgShift: initBgShift,
  };
})();
