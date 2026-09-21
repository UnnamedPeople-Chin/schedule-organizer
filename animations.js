/* ============================================================
   SCHEDULE ORGANIZER — ANIMATION JAVASCRIPT ENGINE
   ============================================================ */

(function() {
    'use strict';

    /* ── 1. AUTH FORM SLIDE TRANSITION ──────────────────── */
    const origSwitchAuthTab = window.switchAuthTab;
    window.switchAuthTab = function(tab) {
        const loginW = document.getElementById('auth-login-wrapper');
        const signupW = document.getElementById('auth-signup-wrapper');
        if (!loginW || !signupW) {
            if (origSwitchAuthTab) origSwitchAuthTab(tab);
            return;
        }

        const isLoginVisible = loginW.style.display !== 'none';
        const outEl  = isLoginVisible ? loginW  : signupW;
        const inEl   = isLoginVisible ? signupW : loginW;

        if ((tab === 'login' && !isLoginVisible) || (tab === 'signup' && isLoginVisible)) {
            outEl.classList.add(tab === 'login' ? 'sliding-out-right' : 'sliding-out-left');
            setTimeout(() => {
                outEl.classList.remove('sliding-out-right', 'sliding-out-left');
                if (origSwitchAuthTab) origSwitchAuthTab(tab);
                inEl.classList.add(tab === 'login' ? 'sliding-in-left' : 'sliding-in-right');
                setTimeout(() => inEl.classList.remove('sliding-in-right', 'sliding-in-left'), 400);
            }, 220);
        } else {
            if (origSwitchAuthTab) origSwitchAuthTab(tab);
        }
    };

    /* ── 2. MODAL OPEN / CLOSE ANIMATION ────────────────── */
    function animateModalOpen(overlayId) {
        const el = document.getElementById(overlayId);
        if (!el) return;
        el.classList.remove('closing');
        el.style.display = 'flex';
        // Force reflow
        void el.offsetWidth;
        const box = el.querySelector('.modal-box');
        if (box) {
            box.style.animation = 'none';
            void box.offsetWidth;
            box.style.animation = '';
        }
    }

    function animateModalClose(overlayId, callback) {
        const el = document.getElementById(overlayId);
        if (!el) { if (callback) callback(); return; }
        el.classList.add('closing');
        setTimeout(() => {
            el.classList.remove('closing');
            el.style.display = 'none';
            if (callback) callback();
        }, 260);
    }

    // Expose helpers globally
    window._animModalOpen  = animateModalOpen;
    window._animModalClose = animateModalClose;

    // Patch closeAllModals to animate out — but skips a given modal id
    const origCloseAllModals = window.closeAllModals;
    window.closeAllModals = function(exceptId) {
        const overlays = document.querySelectorAll('.modal-overlay');
        overlays.forEach(el => {
            if (exceptId && el.id === exceptId) return; // skip target
            if (el.style.display === 'none' || el.style.display === '') return;
            el.classList.add('closing');
            setTimeout(() => {
                el.classList.remove('closing');
                el.style.display = 'none';
            }, 260);
        });
    };

    // Patch openProfileModal to not flicker
    const origOpenProfileModal = window.openProfileModal;
    window.openProfileModal = function() {
        // Close all OTHER modals first (skip profile card itself)
        window.closeAllModals('modal-profile-card');
        if (window.loadProfileData) window.loadProfileData();
        const modal = document.getElementById('modal-profile-card');
        if (modal) {
            modal.classList.remove('closing');
            modal.style.display = 'flex';
            // Re-trigger box animation
            const box = modal.querySelector('.modal-box');
            if (box) { box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; }
        }
    };

    /* ── 3. AGENDA / DASHBOARD CARD FADE-IN ─────────────── */
    function applyCardAnims(container) {
        if (!container) return;
        const cards = container.querySelectorAll(
            '.event-card, .todo-item, .agenda-item, .agenda-card, .detail-item-row'
        );
        cards.forEach((card, i) => {
            card.classList.add('agenda-card-anim');
            card.style.transitionDelay = `${i * 55}ms`;
            setTimeout(() => card.classList.add('anim-visible'), 30);
        });
    }

    // Watch for DOM mutations on main content to animate new cards
    const dashboardTargets = ['#view-hari', '#view-bulan', '#agenda-list-container', '#todo-list-container'];

    function observeCardContainer(selector) {
        const el = document.querySelector(selector);
        if (!el) return;
        const mo = new MutationObserver(() => {
            const freshCards = el.querySelectorAll('.event-card:not(.agenda-card-anim), .todo-item:not(.agenda-card-anim)');
            freshCards.forEach((card, i) => {
                card.classList.add('agenda-card-anim');
                card.style.transitionDelay = `${i * 50}ms`;
                setTimeout(() => card.classList.add('anim-visible'), 20);
            });
        });
        mo.observe(el, { childList: true, subtree: true });
    }

    /* ── 4. FILTER STATE TRANSITION ─────────────────────── */
    function pulseFilterContent(container) {
        if (!container) return;
        container.style.animation = 'none';
        void container.offsetWidth;
        container.classList.add('filter-content-fade');
        setTimeout(() => container.classList.remove('filter-content-fade'), 400);
    }

    // Intercept filter chip clicks to animate content
    document.addEventListener('click', function(e) {
        const chip = e.target.closest('.filter-chip, .filter-pill, .hari-filter-btn');
        if (!chip) return;
        const listContainer = document.querySelector('#agenda-list-container, #todo-list-container, .hari-timeline');
        setTimeout(() => pulseFilterContent(listContainer), 10);
    });

    /* ── 5. CALENDAR SLIDE (PREV / NEXT MONTH/WEEK) ──────── */
    function addCalSlide(direction) {
        const targets = [
            document.querySelector('.hari-timeline'),
            document.querySelector('.month-calendar-grid'),
            document.querySelector('.calendar-week-grid'),
            document.querySelector('.weekly-grid-body')
        ].filter(Boolean);

        targets.forEach(el => {
            el.classList.remove('calendar-slide-left', 'calendar-slide-right');
            void el.offsetWidth;
            el.classList.add(direction === 'next' ? 'calendar-slide-right' : 'calendar-slide-left');
            setTimeout(() => el.classList.remove('calendar-slide-left', 'calendar-slide-right'), 400);
        });
    }

    // Listen for prev/next navigation buttons
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id === 'btn-prev-week' || btn.classList.contains('btn-prev') || btn.textContent.includes('‹') || btn.textContent.includes('←')) {
            setTimeout(() => addCalSlide('prev'), 0);
        }
        if (btn.id === 'btn-next-week' || btn.classList.contains('btn-next') || btn.textContent.includes('›') || btn.textContent.includes('→')) {
            setTimeout(() => addCalSlide('next'), 0);
        }
    });

    /* ── 6. DATE SELECTED PULSE ─────────────────────────── */
    document.addEventListener('click', function(e) {
        const dayEl = e.target.closest('.hari-item, .day-cell, .day-col');
        if (!dayEl) return;
        dayEl.classList.remove('date-selected-pulse');
        void dayEl.offsetWidth;
        dayEl.classList.add('date-selected-pulse');
        setTimeout(() => dayEl.classList.remove('date-selected-pulse'), 700);
    });

    /* ── 7. CLASH WARNING SHAKE ─────────────────────────── */
    const origShowClash = window.showClashModal || window.openClashModal;
    function triggerClashShake() {
        const el = document.querySelector('.clash-box-new, #modal-double-confirm-clash .modal-box');
        if (!el) return;
        el.classList.remove('clash-warning-shake');
        void el.offsetWidth;
        el.classList.add('clash-warning-shake');
        setTimeout(() => el.classList.remove('clash-warning-shake'), 600);
    }
    // MutationObserver to detect when clash modal opens
    const clashObserver = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            if (m.type === 'attributes' && m.attributeName === 'style') {
                const el = m.target;
                if (el.id === 'modal-double-confirm-clash' && el.style.display !== 'none') {
                    setTimeout(triggerClashShake, 300);
                }
            }
        });
    });
    const clashModal = document.getElementById('modal-double-confirm-clash');
    if (clashModal) clashObserver.observe(clashModal, { attributes: true });

    /* ── 8. COUNT-UP ANIMATION ──────────────────────────── */
    function countUp(el, target, duration) {
        if (!el) return;
        const start = 0;
        const startTime = performance.now();
        el.classList.add('stat-count-anim');

        function step(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(start + (target - start) * eased);
            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = target;
        }
        requestAnimationFrame(step);
    }

    function runStatsCountUp() {
        const stats = [
            { id: 'stat-total-agenda' },
            { id: 'stat-total-todo' },
            { id: 'stat-completed-todo' },
            { id: 'stat-pending-todo' }
        ];
        stats.forEach(({ id }, i) => {
            const el = document.getElementById(id);
            if (!el) return;
            const target = parseInt(el.textContent) || 0;
            el.textContent = '0';
            setTimeout(() => countUp(el, target, 900), i * 120);
        });
    }

    // Intersection Observer for stat section
    const statSection = document.querySelector('.stat-items-stack');
    if (statSection && window.IntersectionObserver) {
        const statObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    runStatsCountUp();
                    statObserver.disconnect();
                }
            });
        }, { threshold: 0.3 });
        statObserver.observe(statSection);
    }

    /* ── 9. RE-TRIGGER STATS ON VIEW SWITCH ─────────────── */
    const origRenderActiveView = window.renderActiveView;
    window.renderActiveView = function() {
        if (origRenderActiveView) origRenderActiveView.apply(this, arguments);
        // Animate stat numbers every time Hari view renders
        setTimeout(() => {
            const statEl = document.getElementById('stat-total-agenda');
            if (statEl) runStatsCountUp();
        }, 150);
        // Animate cards
        setTimeout(() => {
            const containers = document.querySelectorAll('.hari-timeline, #agenda-list-container, #todo-list-container');
            containers.forEach(applyCardAnims);
        }, 60);
    };

    /* ── 10. SCROLL-BASED FADE-IN via IntersectionObserver ── */
    if (window.IntersectionObserver) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('anim-visible');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        function observeAnimReady() {
            document.querySelectorAll('.anim-ready:not(.anim-visible)').forEach(el => io.observe(el));
        }
        observeAnimReady();

        // Re-scan on any DOM changes (for dynamically rendered cards)
        const bodyObs = new MutationObserver(observeAnimReady);
        bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    /* ── 11. INIT: observe dashboard containers ──────────── */
    document.addEventListener('DOMContentLoaded', function() {
        dashboardTargets.forEach(observeCardContainer);

        // Initial card animation
        setTimeout(() => {
            const containers = document.querySelectorAll('.hari-timeline, #agenda-list-container');
            containers.forEach(applyCardAnims);
        }, 100);
    });

    // Also run immediately in case DOMContentLoaded already fired
    if (document.readyState !== 'loading') {
        dashboardTargets.forEach(observeCardContainer);
    }

})();
