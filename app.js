/**
 * Schedule Organizer - Figma Redesign Logic
 * Developed for Kelompok 4 - Desain UI/UX Mahasiswa Polines
 */

// ==========================================
// STATE MANAGEMENT & MOCK DATA
// ==========================================

// ==========================================
// FIREBASE INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCPVSU0OANv9kvMDF0fh3_Y-5_utT82iHE",
  authDomain: "schedule-organizer-3a878.firebaseapp.com",
  projectId: "schedule-organizer-3a878",
  storageBucket: "schedule-organizer-3a878.firebasestorage.app",
  messagingSenderId: "915280939298",
  appId: "1:915280939298:web:382db57e53f908e76fbd7b",
  measurementId: "G-93WG9SW5V3"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

let currentUserProfile = null;

let state = {
    schedules: [],
    todos: [],
    categories: [
        { id: 'meeting', title: 'Meeting', color: '#3b82f6' },
        { id: 'deadline', title: 'Deadline', color: '#ef4444' },
        { id: 'review', title: 'Review', color: '#f59e0b' },
        { id: 'personal', title: 'Personal', color: '#10b981' }
    ],
    selectedMonth: new Date().getMonth(), // Dynamic to current month
    selectedYear: new Date().getFullYear(), // Dynamic to current year
    currentView: 'hari', // 'hari', 'minggu', 'bulan'
    selectedCategoryFilter: 'all',
    selectedHariDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(), // Default to today
    selectedHariFilter: 'all', // 'all', 'selesai', 'berlangsung', 'akan_datang'
    selectedMingguWeekOffset: 0, // 0 means the first week of the selected month
    searchQuery: '',
    
    // Modal wizard state
    modalStep: 1,
    modalType: null, // 'event' or 'todo'
    modalData: {},
    pendingSaveItem: null
};

// LocalStorage helpers
function saveToStorage() {
    if (!auth.currentUser) return;
    db.collection('users').doc(auth.currentUser.email).set({
        schedules: state.schedules,
        todos: state.todos,
        selectedMonth: state.selectedMonth,
        selectedYear: state.selectedYear,
        categories: state.categories
    }, { merge: true }).catch(err => console.error("Error saving data:", err));
}

async function loadFromStorage(user) {
    if (!user) return;
    
    // Set fallback profile immediately so we have it in memory and avoid flashing "Nadia"
    currentUserProfile = { 
        name: user.displayName || user.email.split('@')[0], 
        email: user.email, 
        role: 'Mahasiswa' 
    };
    loadProfileData();

    try {
        const doc = await db.collection('users').doc(user.email).get();
        if (doc.exists) {
            const data = doc.data();
            // Remove any legacy dummy data
            state.schedules = (data.schedules || []).filter(s => !(s.id && s.id.startsWith('dsched-')));
            state.todos = (data.todos || []).filter(t => !(t.id && t.id.startsWith('dtodo-')));
            
            state.selectedMonth = new Date().getMonth();
            state.selectedYear = new Date().getFullYear();
            state.categories = data.categories || [];
            
            if (data.profile) {
                currentUserProfile = data.profile;
            }
            
            // Auto-save cleaned state back if dummy data was filtered out
            if ((data.schedules && data.schedules.length !== state.schedules.length) || 
                (data.todos && data.todos.length !== state.todos.length)) {
                saveToStorage();
            }

            renderActiveView();
            loadProfileData();
        } else {
            loadDefaults();
        }
    } catch (error) {
        console.error("Error loading from Firebase:", error);
        loadDefaults();
    }
    
    // Hide global loading overlay once data is loaded
    hideGlobalLoading();
}

function hideGlobalLoading() {
    const loader = document.getElementById('global-loading-overlay');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
        }, 400); // Wait for transition
    }
}

function loadDefaults() {
    state.schedules = [];
    state.todos = [];
    saveToStorage();
    renderActiveView();
    if (typeof loadProfileData === 'function') {
        loadProfileData();
    }
}

// ==========================================
// CORE INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    const authCont = document.getElementById("auth-container");
    const appCont = document.getElementById("app-container");
    
    auth.onAuthStateChanged(user => {
        if (user) {
            if (authCont) authCont.style.display = "none";
            if (appCont) appCont.style.display = "block";
            loadFromStorage(user);
        } else {
            if (authCont) authCont.style.display = "block";
            if (appCont) appCont.style.display = "none";
            state.schedules = [];
            state.todos = [];
            hideGlobalLoading(); // Hide if they need to see login screen
        }
    });
});

function initApp() {
    // Sidebar hamburger collapse toggle
    const hamburger = document.getElementById('btn-sidebar-hamburger');
    if (hamburger) {
        hamburger.addEventListener('click', () => {
            const layout = document.querySelector('.app-layout');
            if (layout) {
                layout.classList.toggle('collapsed');
            }
        });
    }

    // Phone Country Dropdown logic
    const phoneInputGroup = document.getElementById('btn-toggle-phone-dropdown');
    const phoneCountryList = document.getElementById('phone-country-list');
    const phoneCodeInput = document.getElementById('signup-phone-code');
    const selectedCountryFlag = document.getElementById('selected-country-flag');

    if (phoneInputGroup && phoneCountryList && phoneCodeInput && selectedCountryFlag) {
        // Toggle dropdown on click
        phoneInputGroup.addEventListener('click', (e) => {
            if (e.target !== phoneCodeInput) {
                phoneCodeInput.focus();
            }
            const isVisible = phoneCountryList.style.display === 'block';
            phoneCountryList.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                phoneInputGroup.classList.add('active');
            } else {
                phoneInputGroup.classList.remove('active');
            }
        });

        // Hide when clicking outside
        document.addEventListener('click', (e) => {
            if (!phoneInputGroup.contains(e.target) && !phoneCountryList.contains(e.target)) {
                phoneCountryList.style.display = 'none';
                phoneInputGroup.classList.remove('active');
            }
        });

        // Filter list when typing
        phoneCodeInput.addEventListener('input', (e) => {
            phoneCountryList.style.display = 'block';
            phoneInputGroup.classList.add('active');
            const val = e.target.value.toLowerCase();
            const items = phoneCountryList.querySelectorAll('li');
            let hasMatch = false;
            items.forEach(li => {
                if (li.textContent.toLowerCase().includes(val)) {
                    li.style.display = 'flex';
                    hasMatch = true;
                } else {
                    li.style.display = 'none';
                }
            });
            // Try to auto-update flag if perfect match found
            if (val.length > 1) {
                items.forEach(li => {
                    if (li.getAttribute('data-code') === val) {
                        selectedCountryFlag.src = `https://flagcdn.com/w20/${li.getAttribute('data-flag')}.png`;
                    }
                });
            }
        });

        // Select an item from the list
        phoneCountryList.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li) {
                const code = li.getAttribute('data-code');
                const flagCode = li.getAttribute('data-flag');
                
                phoneCodeInput.value = code;
                selectedCountryFlag.src = `https://flagcdn.com/w20/${flagCode}.png`;
                
                phoneCountryList.style.display = 'none';
                phoneInputGroup.classList.remove('active');
            }
        });
    }

    // Search bar filter listener
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase().trim();
            renderActiveView();
        });
    }

    // Navigation Tabs Router
    const tabs = {
        'tab-nav-hari': 'hari',
        'tab-nav-minggu': 'minggu',
        'tab-nav-bulan': 'bulan'
    };

    Object.keys(tabs).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                switchView(tabs[id]);
            });
        }
    });

    // Modal "+ Buat Tugas" sidebar triggers
    document.getElementById('btn-sidebar-create').addEventListener('click', () => {
        openChoiceModal();
    });

    // Profile Dropdown click triggers
    document.querySelector('.profile-dropdown-btn').addEventListener('click', () => {
        openProfileModal();
    });

    // Choice Modal buttons
    document.getElementById('btn-choice-event').addEventListener('click', () => {
        state.modalType = 'event';
        goToStep(2);
    });
    document.getElementById('btn-choice-todo').addEventListener('click', () => {
        state.modalType = 'todo';
        goToStep(2);
    });

    // Form submits handlers for step wizard
    document.getElementById('form-event-step1').addEventListener('submit', (e) => {
        e.preventDefault();
        state.modalData.title = document.getElementById('input-event-title').value;
        state.modalData.description = document.getElementById('input-event-desc').value;
        goToStep(3);
    });

    document.getElementById('form-todo-step1').addEventListener('submit', (e) => {
        e.preventDefault();
        state.modalData.title = document.getElementById('input-todo-title').value;
        state.modalData.description = document.getElementById('input-todo-desc').value;
        goToStep(3);
    });

    document.getElementById('form-event-step2').addEventListener('submit', (e) => {
        e.preventDefault();
        state.modalData.date = document.getElementById('input-event-date').value;
        state.modalData.category = document.getElementById('input-event-cat').value;
        state.modalData.startTime = document.getElementById('input-event-start').value;
        state.modalData.endTime = document.getElementById('input-event-end').value;
        state.modalData.location = document.getElementById('input-event-loc').value || '-';
        checkClashBeforeStep4('event');
    });

    document.getElementById('form-todo-step2').addEventListener('submit', (e) => {
        e.preventDefault();
        state.modalData.date = document.getElementById('input-todo-date').value;
        state.modalData.startTime = document.getElementById('input-todo-start').value;
        state.modalData.endTime = state.modalData.startTime; // To-Do only has 1 time input now
        state.modalData.priority = document.getElementById('input-todo-priority').value;
        checkClashBeforeStep4('todo');
    });

    document.getElementById('form-reminder-step').addEventListener('submit', (e) => {
        e.preventDefault();
        state.modalData.reminder = document.getElementById('input-reminder-select').value;
        saveWizardData();
    });

    document.getElementById('btn-reminder-back').addEventListener('click', () => {
        goToStep(3);
    });

    // Priority button selectors in To-Do Modal Step 3
    const priorityRows = document.querySelectorAll('.priority-selection-row');
    priorityRows.forEach(row => {
        const btns = row.querySelectorAll('.btn-priority-select');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                btns.forEach(b => b.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                const input = row.querySelector('input[type="hidden"]');
                if (input) input.value = target.getAttribute('data-priority');
            });
        });
    });

    // Month & Year Picker Modal Apply actions
    document.getElementById('btn-calendar-month-picker').addEventListener('click', () => {
        openPickerModal();
    });

    document.getElementById('btn-picker-apply').addEventListener('click', () => {
        applyPickerSelection();
    });

    // Category filter pills clicks in Month tab
    const filterPills = document.querySelectorAll('.calendar-filters-group .filter-pill');
    filterPills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            filterPills.forEach(p => p.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            state.selectedCategoryFilter = target.getAttribute('data-filter');
            renderBulan();
        });
    });

    // Weekly View Navigation Actions
    const btnWeekPrev = document.getElementById('btn-week-prev');
    if (btnWeekPrev) {
        btnWeekPrev.addEventListener('click', () => {
            state.selectedMingguWeekOffset--;
            renderMinggu();
        });
    }

    const btnWeekNext = document.getElementById('btn-week-next');
    if (btnWeekNext) {
        btnWeekNext.addEventListener('click', () => {
            state.selectedMingguWeekOffset++;
            renderMinggu();
        });
    }

    const btnMiniCalPrev = document.getElementById('btn-mini-cal-prev');
    if (btnMiniCalPrev) {
        btnMiniCalPrev.addEventListener('click', () => {
            state.selectedMingguWeekOffset--;
            renderMinggu();
        });
    }

    const btnMiniCalNext = document.getElementById('btn-mini-cal-next');
    if (btnMiniCalNext) {
        btnMiniCalNext.addEventListener('click', () => {
            state.selectedMingguWeekOffset++;
            renderMinggu();
        });
    }

    // Add category Modal trigger
    document.getElementById('btn-add-cat-modal').addEventListener('click', () => {
        openCategoryModal();
    });

    document.getElementById('form-add-category').addEventListener('submit', (e) => {
        e.preventDefault();
        saveCustomCategory();
    });

    // Conflict confirmation buttons
    // Removed duplicate event listener for btn-clash-modal-edit as it's handled via onclick in HTML
    
    const btnClashApply = document.getElementById('btn-clash-apply-recommendation');
    if (btnClashApply) {
        btnClashApply.addEventListener('click', () => {
            if (state.pendingSaveItem && state.selectedClashSuggestion) {
                const item = state.pendingSaveItem;
                item.startTime = state.selectedClashSuggestion.startTime;
                item.endTime = state.selectedClashSuggestion.endTime;
                
                if (!state.pendingSaveIsEdit && (state.pendingSaveType === 'event' || state.pendingSaveType === 'todo')) {
                    // Wizard flow: proceed to step 4
                    state.modalData.startTime = item.startTime;
                    state.modalData.endTime = item.endTime;
                    goToStep(4);
                } else {
                    // Edit flow: commit save immediately
                    commitSave(item, state.pendingSaveType, state.pendingSaveIsEdit);
                    document.getElementById('modal-double-confirm-clash').style.display = 'none';
                }
                
                state.pendingSaveItem = null;
                state.selectedClashSuggestion = null;
                state.pendingSaveType = null;
                state.pendingSaveIsEdit = null;
            } else {
                document.getElementById('modal-double-confirm-clash').style.display = 'none';
            }
        });
    }


    // Initialize month picker selections
    initPickerModalEvents();

    // Check Live Event Time input clashes
    initLiveClashDetector();

    // Render page
    renderActiveView();
}

function switchView(viewName) {
    if (state.currentView === viewName) return;

    const executeSwitch = () => {
        state.currentView = viewName;
        
        // Toggle active class on sidebar tabs
        document.querySelectorAll('.sidebar-links .sidebar-tab').forEach(tab => tab.classList.remove('active'));
        const activeTab = document.getElementById(`tab-nav-${viewName}`);
        if (activeTab) activeTab.classList.add('active');
        
        // Toggle active class on pages
        document.querySelectorAll('.content-container .page-view').forEach(view => view.classList.remove('active'));
        const activePage = document.getElementById(`view-${viewName}`);
        if (activePage) activePage.classList.add('active');
        
        // Header title updates
        const titleEl = document.getElementById('view-title');
        const subtitleEl = document.getElementById('view-subtitle');
        const searchInput = document.getElementById('search-input');
        
        if (viewName === 'hari') {
            titleEl.innerHTML = 'Timeline <span class="teal-text">Agenda</span>';
            subtitleEl.textContent = 'Pantau dan kelola agenda kegiatan secara terstruktur.';
            if (searchInput) searchInput.placeholder = 'Cari Agenda...';
            
            // Reset to today's date when switching to Hari view
            const d = new Date();
            state.selectedHariDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            state.selectedMonth = d.getMonth();
            state.selectedYear = d.getFullYear();
        } else if (viewName === 'minggu') {
            titleEl.innerHTML = 'List <span class="teal-text">View</span>';
            subtitleEl.textContent = 'Lihat daftar agenda dan todo Anda dalam seminggu.';
            if (searchInput) searchInput.placeholder = 'Cari agenda atau tugas...';
            
            // Sync selectedMingguWeekOffset with selectedHariDate
            const firstDay = new Date(state.selectedYear, state.selectedMonth, 1);
            const dayOfWeek = firstDay.getDay();
            const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const firstMonday = new Date(state.selectedYear, state.selectedMonth, 1 - daysToSubtract);
            const parts = state.selectedHariDate.split('-');
            const targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            
            const diffTime = targetDate - firstMonday;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            state.selectedMingguWeekOffset = Math.floor(diffDays / 7);
        } else if (viewName === 'bulan') {
            titleEl.innerHTML = 'Task <span class="teal-text">Calendar</span>';
            subtitleEl.textContent = 'Pantau dan kelola agenda kegiatan secara terstruktur.';
            if (searchInput) searchInput.placeholder = 'Cari agenda atau tugas...';
        }
        
        renderActiveView();
    };

    const mainContainer = document.querySelector('.content-container');
    if (mainContainer) {
        mainContainer.classList.add('page-fade-out');
        setTimeout(() => {
            executeSwitch();
            mainContainer.classList.remove('page-fade-out');
            mainContainer.classList.add('page-fade-in');
            setTimeout(() => {
                mainContainer.classList.remove('page-fade-in');
            }, 300);
        }, 150);
    } else {
        executeSwitch();
    }
}

function renderActiveView() {
    if (state.currentView === 'hari') {
        renderHari();
    } else if (state.currentView === 'minggu') {
        renderMinggu();
    } else if (state.currentView === 'bulan') {
        renderBulan();
    }
    updateSimulatorDropdown();
}

function applyStaggerAnimation(containerSelector, itemSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const items = container.querySelectorAll(itemSelector);
    items.forEach((item, index) => {
        item.classList.add('stagger-item');
        // Max out delay to prevent super long waits on long lists
        const delay = Math.min(index * 0.05, 0.5); 
        item.style.animationDelay = `${delay}s`;
    });
}

// ==========================================
// RENDERING VIEW 1: HARI
// ==========================================
function renderHari() {
    const upcomingStack = document.getElementById('hari-upcoming-agenda-stack');
    const timelineBody = document.getElementById('hari-timeline-body');
    if (!upcomingStack || !timelineBody) return;

    upcomingStack.innerHTML = '';
    timelineBody.innerHTML = '';

    // Ensure selectedHariDate is within the selected month and year (parsed timezone-safely)
    const parts = state.selectedHariDate.split('-');
    if (parts.length === 3) {
        const yearVal = parseInt(parts[0], 10);
        const monthVal = parseInt(parts[1], 10) - 1;
        if (yearVal !== state.selectedYear || monthVal !== state.selectedMonth) {
            // Default to the 1st of the selected month
            const newDate = new Date(state.selectedYear, state.selectedMonth, 1);
            const yyyy = newDate.getFullYear();
            const mm = String(newDate.getMonth() + 1).padStart(2, '0');
            const dd = String(newDate.getDate()).padStart(2, '0');
            state.selectedHariDate = `${yyyy}-${mm}-${dd}`;
        }
    }

    // Render the horizontal month and date selector strips!
    renderHorizontalMonthStrip();
    renderHorizontalDateStrip();

    // 1. Render Left Column: Agenda Mendatang & To Do Mendatang
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
    const currentTimeStr = `${String(todayObj.getHours()).padStart(2, '0')}:${String(todayObj.getMinutes()).padStart(2, '0')}`;

    let upcomingAgendas = state.schedules.filter(s => {
        if (s.date > todayStr) return true;
        if (s.date === todayStr && s.startTime >= currentTimeStr) return true;
        return false;
    }).sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
    });

    let upcomingTodos = state.todos.filter(t => {
        if (!t.completed && t.date) {
            if (t.date > todayStr) return true;
            if (t.date === todayStr && (t.endTime || t.startTime || '23:59') >= currentTimeStr) return true;
        }
        return false;
    }).sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        
        const pMap = { 'high': 1, 'medium': 2, 'low': 3 };
        const pA = pMap[a.priority] || 3;
        const pB = pMap[b.priority] || 3;
        if (pA !== pB) return pA - pB;

        const aTime = a.startTime || '00:00';
        const bTime = b.startTime || '00:00';
        return aTime.localeCompare(bTime);
    });

    if (state.searchQuery) {
        upcomingAgendas = upcomingAgendas.filter(s => 
            s.title.toLowerCase().includes(state.searchQuery) ||
            (s.description && s.description.toLowerCase().includes(state.searchQuery)) ||
            (s.location && s.location.toLowerCase().includes(state.searchQuery))
        );
        upcomingTodos = upcomingTodos.filter(t => 
            t.title.toLowerCase().includes(state.searchQuery)
        );
    }

    const formatCardDate = (dateStr) => {
        if(!dateStr) return { dayNum: '-', monthText: '-' };
        const parts = dateStr.split('-');
        const dayNum = parts[2];
        const monthsShort = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
        const monthText = monthsShort[parseInt(parts[1]) - 1];
        return { dayNum, monthText };
    };

    if (upcomingAgendas.length > 0) {
        upcomingStack.innerHTML = upcomingAgendas.map((ev, index) => {
            const { dayNum, monthText } = formatCardDate(ev.date);
            const colorClasses = ['teal-date', 'yellow-date', 'green-date'];
            const colorClass = colorClasses[index % 3];
            const isActive = (ev.date === state.selectedHariDate) ? 'active' : '';

            return `
                <div class="agenda-upcoming-card ${colorClass} ${isActive}" style="position: relative;">
                    <div class="card-date-box" onclick="selectHariDate('${ev.date}')" style="cursor: pointer;">
                        <span class="day-num">${dayNum}</span>
                        <span class="month-name">${monthText}</span>
                    </div>
                    <div class="card-content-details" onclick="selectHariDate('${ev.date}')" style="cursor: pointer;">
                        <h4>${ev.title}</h4>
                        <p>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ${ev.startTime} - ${ev.endTime}
                        </p>
                        <p>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            ${ev.location}
                        </p>
                    </div>
                    
                    <div class="context-menu-container">
                        <button class="context-menu-btn" onclick="toggleContextMenu(event, 'ctx-agenda-${ev.id}')">⋮</button>
                        <div class="context-menu-dropdown" id="ctx-agenda-${ev.id}">
                            <button class="context-menu-item" onclick="openEditAgenda('${ev.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                Edit Jadwal
                            </button>
                            <button class="context-menu-item delete" onclick="openDeleteConfirmModal('${ev.id}', 'agenda')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                Hapus Jadwal
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        upcomingStack.innerHTML = `<div class="agenda-upcoming-card teal-date"><div class="card-content-details"><h4 style="color: #94a3b8; font-weight: 500; font-style: italic;">Tidak ada agenda mendatang</h4></div></div>`;
    }

    const todoStack = document.getElementById('hari-upcoming-todo-stack');
    if (todoStack) {
        if (upcomingTodos.length > 0) {
            todoStack.innerHTML = upcomingTodos.map((ev, index) => {
                const { dayNum, monthText } = formatCardDate(ev.date);
                const colorClasses = ['teal-date', 'yellow-date', 'green-date'];
                const colorClass = colorClasses[index % 3];
                const isActive = (ev.date === state.selectedHariDate) ? 'active' : '';
                
                let priorityClass = '';
                let priorityLabel = '';
                if (ev.priority === 'high') { priorityClass = 'high'; priorityLabel = 'Tinggi'; }
                else if (ev.priority === 'medium') { priorityClass = 'medium'; priorityLabel = 'Sedang'; }
                else { priorityClass = 'low'; priorityLabel = 'Rendah'; }

                let timeDisplay = '';
                if (ev.startTime) {
                    const timeStr = (ev.startTime === ev.endTime || !ev.endTime) ? ev.startTime : `${ev.startTime} - ${ev.endTime}`;
                    timeDisplay = `<p><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${timeStr}</p>`;
                }

                return `
                    <div class="agenda-upcoming-card ${colorClass} ${isActive}" style="position: relative;">
                        <div class="card-date-box" onclick="selectHariDate('${ev.date}')" style="cursor: pointer;">
                            <span class="day-num">${dayNum}</span>
                            <span class="month-name">${monthText}</span>
                        </div>
                        <div class="card-content-details" onclick="selectHariDate('${ev.date}')" style="cursor: pointer;">
                            <h4>${ev.title}</h4>
                            ${timeDisplay}
                            <span class="todo-priority-tag ${priorityClass}" style="margin-top: 4px; display: inline-block;">${priorityLabel}</span>
                        </div>
                        
                        <div class="context-menu-container">
                            <button class="context-menu-btn" onclick="toggleContextMenu(event, 'ctx-todo-${ev.id}')">⋮</button>
                            <div class="context-menu-dropdown" id="ctx-todo-${ev.id}">
                                <button class="context-menu-item" onclick="openEditTodo('${ev.id}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                    Edit Todo
                                </button>
                                <button class="context-menu-item delete" onclick="openDeleteConfirmModal('${ev.id}', 'todo')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                    Hapus Todo
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            todoStack.innerHTML = `<div class="agenda-upcoming-card teal-date"><div class="card-content-details"><h4 style="color: #94a3b8; font-weight: 500; font-style: italic;">Tidak ada to-do mendatang</h4></div></div>`;
        }
    }

    // 2. Render Right Column: Timeline Agenda Table
    // Get all schedules on the selected view date
    let daySchedules = state.schedules
        .filter(s => s.date === state.selectedHariDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
        
    // Apply status filter
    if (state.selectedHariFilter !== 'all') {
        daySchedules = daySchedules.filter(s => s.status === state.selectedHariFilter);
    }

    // Apply search query filter
    if (state.searchQuery) {
        daySchedules = daySchedules.filter(s => 
            s.title.toLowerCase().includes(state.searchQuery) ||
            (s.description && s.description.toLowerCase().includes(state.searchQuery)) ||
            (s.location && s.location.toLowerCase().includes(state.searchQuery))
        );
    }

    if (daySchedules.length === 0) {
        timelineBody.innerHTML = `
            <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-secondary);">
                ☕ Tidak ada agenda kuliah atau organisasi hari ini.
            </div>
        `;
        return;
    }

    timelineBody.innerHTML = daySchedules.map(s => {
        // Map status tags from state or fallback
        const statusMap = {
            'selesai': '<span class="status-pill selesai">Selesai</span>',
            'berlangsung': '<span class="status-pill berlangsung">Berlangsung</span>',
            'akan_datang': '<span class="status-pill akan_datang">Akan Datang</span>'
        };
        const statusHTML = statusMap[s.status] || '<span class="status-pill akan_datang">Akan Datang</span>';
        
        // Location Icon logic
        let locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
        if (s.location.toLowerCase().includes('kirim') || s.location.toLowerCase().includes('portal')) {
            locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
        } else if (s.location.toLowerCase().includes('zoom')) {
            locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
        } else if (s.location.toLowerCase().includes('review') || s.location.toLowerCase().includes('dokumen') || s.location.toLowerCase().includes('portal')) {
            locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        }

        // Description Icon logic
        let descSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        if (s.description && s.description.toLowerCase().includes('check')) {
            descSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        } else if (s.description && s.description.toLowerCase().includes('presentasi')) {
            descSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>`;
        } else if (s.description && s.description.toLowerCase().includes('proposal') || s.description && s.description.toLowerCase().includes('revisi')) {
            descSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        }

        return `
            <div class="timeline-row">
                <div class="time-cell">${s.startTime}</div>
                <div class="agenda-cell">
                    <span class="timeline-dot"></span>
                    <div class="agenda-cell-info">
                        <h4>${s.title}</h4>
                        <span class="cat-pill-tag ${s.category}">${s.tag || capitalize(s.category)}</span>
                    </div>
                </div>
                <div class="detail-cell">
                    <p>${locSVG} ${s.location}</p>
                    <p>${descSVG} ${s.description || '-'}</p>
                </div>
                <div class="status-cell">
                    ${statusHTML}
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// RENDERING VIEW 2: MINGGU
// ==========================================
function renderMinggu() {
    const schedStack = document.getElementById('weekly-schedules-stack');
    const todoGrid = document.getElementById('weekly-todo-grid');
    if (!schedStack || !todoGrid) return;

    schedStack.innerHTML = '';
    todoGrid.innerHTML = '';

    // Dynamic week range based on selected month, year, and week offset
    const year = state.selectedYear;
    const month = state.selectedMonth;
    const firstDayOfMonth = new Date(year, month, 1);
    
    // Find the first Monday on or before the 1st of the month
    const dayOfWeek = firstDayOfMonth.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const firstMonday = new Date(year, month, 1 - daysToSubtract);
    
    // Add offset weeks
    const weekStartDate = new Date(firstMonday);
    weekStartDate.setDate(firstMonday.getDate() + (state.selectedMingguWeekOffset * 7));
    
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    
    // Format to YYYY-MM-DD
    const formatDateStr = (d) => {
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
    };
    
    const weekStartStr = formatDateStr(weekStartDate);
    const weekEndStr = formatDateStr(weekEndDate);

    // Update banner UI text
    const bannerText = document.getElementById('week-date-range');
    if (bannerText) {
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        // Format e.g., "2 Juni - 8 Juni 2025" or "30 Juni - 6 Juli 2025"
        bannerText.textContent = `${weekStartDate.getDate()} ${months[weekStartDate.getMonth()]} - ${weekEndDate.getDate()} ${months[weekEndDate.getMonth()]} ${weekEndDate.getFullYear()}`;
    }

    // 1. Render schedules in week
    let weekSchedules = state.schedules
        .filter(s => s.date >= weekStartStr && s.date <= weekEndStr);
        
    if (state.searchQuery) {
        weekSchedules = weekSchedules.filter(s => 
            s.title.toLowerCase().includes(state.searchQuery) ||
            (s.description && s.description.toLowerCase().includes(state.searchQuery)) ||
            (s.location && s.location.toLowerCase().includes(state.searchQuery))
        );
    }
    
    weekSchedules.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    if (weekSchedules.length === 0) {
        schedStack.innerHTML = '<div class="empty-state">Tidak ada jadwal kuliah minggu ini.</div>';
    } else {
        schedStack.innerHTML = weekSchedules.map(s => {
            const dayName = getDayNameIndo(s.date);
            const dateText = formatDateIndo(s.date);
            
            // Icon code representation with SVG
            let iconSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
            if (s.category === 'meeting') {
                iconSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
            } else if (s.category === 'review') {
                iconSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 1 10-10 1 1 0 0 1-1 1h-2a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1h-5z"></path><circle cx="7.5" cy="10.5" r=".5" fill="currentColor"></circle><circle cx="10.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="14.5" cy="7.5" r=".5" fill="currentColor"></circle><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle></svg>`;
            } else if (s.category === 'deadline') {
                iconSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
            }

            // Location Icon logic
            let locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
            if (s.location.toLowerCase().includes('kirim')) {
                locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
            } else if (s.location.toLowerCase().includes('zoom')) {
                locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
            } else if (s.location.toLowerCase().includes('review dokumen')) {
                locSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
            }

            // Description Icon logic
            let descSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
            if (s.description && s.description.toLowerCase().includes('check')) {
                descSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
            } else if (s.description && s.description.toLowerCase().includes('presentasi')) {
                descSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>`;
            }

            return `
                <div class="weekly-schedule-card border-${s.category}">
                    <div class="weekly-sched-left">
                        <div class="weekly-icon-badge color-${s.category}">${iconSVG}</div>
                        <div class="weekly-details">
                            <h4>${s.title}</h4>
                            <p>${dayName}, ${dateText} • ${s.startTime} - ${s.endTime}</p>
                        </div>
                    </div>
                    <div class="weekly-sched-mid">
                        <span>${locSVG} ${s.location}</span>
                        <span>${descSVG} ${s.description || '-'}</span>
                    </div>
                    <span class="cat-pill-tag ${s.category}">${s.tag || capitalize(s.category)}</span>
                </div>
            `;
        }).join('');
    }

    // 2. Render todos in week
    let weekTodos = state.todos.filter(t => t.date >= weekStartStr && t.date <= weekEndStr);
    
    if (state.searchQuery) {
        weekTodos = weekTodos.filter(t => 
            t.title.toLowerCase().includes(state.searchQuery) ||
            (t.description && t.description.toLowerCase().includes(state.searchQuery))
        );
    }
    
    if (weekTodos.length === 0) {
        todoGrid.innerHTML = '<div class="empty-state">Tidak ada tugas To-Do minggu ini.</div>';
    } else {
        todoGrid.innerHTML = weekTodos.map(t => {
            const checkedClass = t.completed ? 'checked' : '';
            const isChecked = t.completed ? 'checked' : '';
            
            // Map priority tag styles
            const priorityLabel = t.priority === 'high' ? 'Tinggi' : t.priority === 'medium' ? 'Sedang' : 'Rendah';

            return `
                <div class="todo-checkbox-card ${checkedClass}">
                    <div class="todo-card-left">
                        <input type="checkbox" ${isChecked} onchange="toggleTodoComplete('${t.id}', this)">
                        <span class="todo-title">${t.title}</span>
                    </div>
                    <div class="todo-card-tags">
                        <span class="todo-day-tag">${t.day}</span>
                        <span class="todo-priority-tag ${t.priority}">${priorityLabel}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3. Render Right-Side Mini Calendar Grid
    renderMiniCalendar(weekStartDate, weekEndDate);

    // 4. Update Summary Statistics
    updateWeeklyStats(weekTodos, weekSchedules);
    
    // Apply staggered animations
    applyStaggerAnimation('#minggu-days-grid', '.day-col');
}

function renderMiniCalendar(weekStartDate, weekEndDate) {
    const grid = document.getElementById('mini-cal-days-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Render based on the month of the weekStartDate
    // If we want to align with the global month picker, we use state.selectedYear and state.selectedMonth
    const year = weekStartDate ? weekStartDate.getFullYear() : state.selectedYear;
    const month = weekStartDate ? weekStartDate.getMonth() : state.selectedMonth; 

    // Update mini calendar header
    const miniCalHeader = document.getElementById('mini-cal-month-year');
    if (miniCalHeader) {
        const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        miniCalHeader.textContent = `${months[month]} ${year}`;
    }

    const firstDayIndex = new Date(year, month, 1).getDay(); // day index of 1st day (Sunday is 0, Monday is 1)
    // Convert Sunday (0) to 7 for Monday-start offset
    const mondayOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    // Render previous month padding cells
    for (let i = mondayOffset; i > 0; i--) {
        const prevDay = prevMonthTotalDays - i + 1;
        const cell = document.createElement('div');
        cell.className = 'mini-day inactive';
        cell.textContent = prevDay;
        grid.appendChild(cell);
    }

    // Format helpers for checking highlight
    const startStr = weekStartDate ? `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, '0')}-${String(weekStartDate.getDate()).padStart(2, '0')}` : '';
    const endStr = weekEndDate ? `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, '0')}-${String(weekEndDate.getDate()).padStart(2, '0')}` : '';

    // Render month days
    for (let day = 1; day <= totalDays; day++) {
        const cell = document.createElement('div');
        
        // Highlight active week
        const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isWeeklyRange = (currentDateStr >= startStr && currentDateStr <= endStr);
        
        cell.className = `mini-day ${isWeeklyRange ? 'highlighted-week' : ''}`;
        cell.textContent = day;
        grid.appendChild(cell);
    }

    // Render next month padding cells to complete the row
    const renderedCells = mondayOffset + totalDays;
    const nextMonthPadding = renderedCells % 7 === 0 ? 0 : 7 - (renderedCells % 7);
    for (let i = 1; i <= nextMonthPadding; i++) {
        const cell = document.createElement('div');
        cell.className = 'mini-day inactive';
        cell.textContent = i;
        grid.appendChild(cell);
    }
}

function updateWeeklyStats(weekTodos, weekSchedules) {
    const totalAgenda = document.getElementById('stat-total-agenda');
    const totalTodo = document.getElementById('stat-total-todo');
    const completedTodo = document.getElementById('stat-completed-todo');
    const pendingTodo = document.getElementById('stat-pending-todo');

    if (totalAgenda) totalAgenda.textContent = weekSchedules.length;
    if (totalTodo) totalTodo.textContent = weekTodos.length;
    
    const completedCount = weekTodos.filter(t => t.completed).length;
    if (completedTodo) completedTodo.textContent = completedCount;
    if (pendingTodo) pendingTodo.textContent = weekTodos.length - completedCount;
}

window.toggleTodoComplete = function(todoId, checkboxEl) {
    const todo = state.todos.find(t => t.id === todoId);
    if (!todo) return;
    
    todo.completed = !todo.completed;
    
    if (checkboxEl) {
        const card = checkboxEl.closest('.todo-checkbox-card');
        if (card) {
            // Apply animating check class
            card.classList.add('animating-check');
            if (todo.completed) {
                card.classList.add('completed-anim');
            }
            
            setTimeout(() => {
                saveToStorage();
                renderMinggu();
            }, 400); // Wait for animation before re-render
            return;
        }
    }
    
    // Fallback if no element passed
    saveToStorage();
    renderMinggu();
};

// ==========================================
// RENDERING VIEW 3: BULAN
// ==========================================
function renderBulan() {
    const grid = document.getElementById('monthly-days-grid');
    const selectedMonthLabel = document.getElementById('calendar-selected-month');
    if (!grid) return;

    grid.innerHTML = '';
    const year = state.selectedYear;
    const month = state.selectedMonth;

    const monthsNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    if (selectedMonthLabel) selectedMonthLabel.textContent = `${monthsNames[month]} ${year}`;

    // Grid starting on Monday (Monday-first)
    const firstDayIndex = new Date(year, month, 1).getDay(); // Sunday=0, Monday=1
    const mondayOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    // Render prev month padding
    for (let i = mondayOffset; i > 0; i--) {
        const prevDay = prevMonthTotalDays - i + 1;
        const cell = document.createElement('div');
        cell.className = 'monthly-day-cell inactive';
        cell.innerHTML = `<span class="day-number">${prevDay}</span>`;
        grid.appendChild(cell);
    }

    // Render active month days
    for (let day = 1; day <= totalDays; day++) {
        const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const cell = document.createElement('div');
        cell.className = 'monthly-day-cell';
        cell.style.cursor = 'pointer';
        cell.setAttribute('onclick', `window.openDateDetailModal('${dayStr}', event)`);
        
        let cellHTML = `<span class="day-number">${day}</span>`;
        
        // Find events on this date
        let dayEvents = state.schedules.filter(s => s.date === dayStr).map(e => ({...e, itemType: 'agenda'}));
        
        // Apply filters
        if (state.selectedCategoryFilter !== 'all') {
            dayEvents = dayEvents.filter(s => s.category === state.selectedCategoryFilter);
        }

        // Apply search query filter
        if (state.searchQuery) {
            dayEvents = dayEvents.filter(s => 
                s.title.toLowerCase().includes(state.searchQuery) ||
                (s.description && s.description.toLowerCase().includes(state.searchQuery)) ||
                (s.location && s.location.toLowerCase().includes(state.searchQuery))
            );
        }

        let dayTodos = state.todos.filter(t => t.date === dayStr).map(t => ({...t, itemType: 'todo'}));
        if (state.selectedCategoryFilter !== 'all') {
            dayTodos = []; // Hide todos if a specific agenda category filter is active
        }
        if (state.searchQuery) {
            dayTodos = dayTodos.filter(t => 
                t.title.toLowerCase().includes(state.searchQuery) ||
                (t.description && t.description.toLowerCase().includes(state.searchQuery))
            );
        }

        let allItems = [...dayEvents, ...dayTodos];
        allItems.sort((a, b) => {
            const timeA = a.startTime || "24:00";
            const timeB = b.startTime || "24:00";
            return timeA.localeCompare(timeB);
        });

        if (allItems.length > 0) {
            cellHTML += `<div class="cell-solid-events-wrap">`;
            allItems.slice(0, 3).forEach(ev => {
                if (ev.itemType === 'agenda') {
                    cellHTML += `
                        <div class="monthly-event-bar ${ev.category}" title="${ev.title}" style="pointer-events: none;">
                            • ${ev.title} ${ev.startTime}
                        </div>
                    `;
                } else {
                    cellHTML += `
                        <div class="monthly-event-bar" title="${ev.title}" style="background-color: transparent; border: none; color: #334155; font-weight: 500; padding: 2px 4px; display: flex; align-items: center; gap: 4px; pointer-events: none; width: 100%; min-width: 0; box-sizing: border-box; overflow: hidden;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle></svg> 
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;">${ev.title}</span>
                        </div>
                    `;
                }
            });
            if (allItems.length > 3) {
                cellHTML += `<div class="monthly-event-bar" style="background:#cbd5e1; color:#334155; text-align:center; pointer-events: none;">+${allItems.length - 3} lainnya</div>`;
            }
            cellHTML += `</div>`;
        }

        cell.innerHTML = cellHTML;
        grid.appendChild(cell);
    }

    // Render next month padding cells to complete the row
    const renderedCells = mondayOffset + totalDays;
    const nextMonthPadding = renderedCells % 7 === 0 ? 0 : 7 - (renderedCells % 7);
    for (let i = 1; i <= nextMonthPadding; i++) {
        const cell = document.createElement('div');
        cell.className = 'monthly-day-cell inactive';
        cell.innerHTML = `<span class="day-number">${i}</span>`;
        grid.appendChild(cell);
    }
    
    // Apply staggered animations
    applyStaggerAnimation('#monthly-days-grid', '.monthly-day-cell');
}

// Global click event viewer helper
window.openEventDetailsCard = function(eventId) {
    const ev = state.schedules.find(s => s.id === eventId);
    if (ev) {
        alert(`Agenda: ${ev.title}\nKategori: ${ev.category.toUpperCase()}\nWaktu: ${ev.startTime} - ${ev.endTime}\nLokasi: ${ev.location}\nDetail: ${ev.description || '-'}`);
    }
};

// ==========================================
// MULTI-STEP CREATION WIZARD LOGIC
// ==========================================
function openChoiceModal() {
    closeAllModals();
    state.modalStep = 1;
    state.modalType = null;
    state.modalData = {};
    document.getElementById('modal-step1-choice').style.display = 'flex';
}

function closeAllModals() {
    const modals = [
        'modal-step1-choice',
        'modal-step2-event',
        'modal-step2-todo',
        'modal-step3-event-time',
        'modal-step3-todo-priority',
        'modal-step4-reminder',
        'modal-double-confirm-clash',
        'modal-add-category',
        'modal-month-picker',
        'modal-profile-card',
        'modal-edit-agenda',
        'modal-edit-todo',
        'modal-delete-confirm',
        'modal-date-detail'
    ];
    modals.forEach(id => {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    });
}

window.closeEditModals = function() {
    const editModals = [
        'modal-edit-agenda',
        'modal-edit-todo',
        'modal-delete-confirm'
    ];
    editModals.forEach(id => {
        const m = document.getElementById(id);
        if (m) m.style.display = 'none';
    });
}

function goToStep(step) {
    try {
        closeAllModals();
        state.modalStep = step;

        if (step === 1) {
            document.getElementById('modal-step1-choice').style.display = 'flex';
        } 
        else if (step === 2) {
            if (state.modalType === 'event') {
                document.getElementById('modal-step2-event').style.display = 'flex';
                document.getElementById('input-event-title').value = state.modalData.title || '';
                document.getElementById('input-event-desc').value = state.modalData.description || '';
            } else {
                document.getElementById('modal-step2-todo').style.display = 'flex';
                document.getElementById('input-todo-title').value = state.modalData.title || '';
                document.getElementById('input-todo-desc').value = state.modalData.description || '';
            }
        } 
        else if (step === 3) {
            if (state.modalType === 'event') {
                document.getElementById('modal-step3-event-time').style.display = 'flex';
                const eventDateVal = state.modalData.date || getFormattedDateString(new Date());
                document.getElementById('input-event-date').value = eventDateVal;
                window.syncDatePickerText('event', eventDateVal);
                const catVal = state.modalData.category || 'meeting';
                document.getElementById('input-event-cat').value = catVal;
                window.selectCatOption(catVal);
                
                // Populate and sync custom time dropdown values
                const startVal = state.modalData.startTime || '08:00';
                const endVal = state.modalData.endTime || '09:00';
                document.getElementById('input-event-start').value = startVal;
                document.getElementById('input-event-end').value = endVal;
                
                document.getElementById('input-event-loc').value = state.modalData.location || '';
                
                if (window.triggerLiveClashCheck) window.triggerLiveClashCheck('event');
            } else {
                const todoModal = document.getElementById('modal-step3-todo-priority');
                if (!todoModal) {
                    return;
                }
                todoModal.style.display = 'flex';
                const todoDateVal = state.modalData.date || getFormattedDateString(new Date());
                document.getElementById('input-todo-date').value = todoDateVal;
                window.syncDatePickerText('todo', todoDateVal);
                
                // Sync time inputs
                const startVal = state.modalData.startTime || '08:00';
                document.getElementById('input-todo-start').value = startVal;
                
                // Sync priority buttons
                const p = state.modalData.priority || 'medium';
                document.getElementById('input-todo-priority').value = p;
                document.querySelectorAll('.priority-selection-row .btn-priority-select').forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.getAttribute('data-priority') === p) {
                        btn.classList.add('active');
                    }
                });
                
                if (window.triggerLiveClashCheck) window.triggerLiveClashCheck('todo');
            }
        }
        else if (step === 4) {
            document.getElementById('modal-step4-reminder').style.display = 'flex';
            document.getElementById('reminder-modal-title').textContent = state.modalType === 'event' ? 'Tambah Event' : 'Tambah To-Do';
            
            const currentRemindVal = state.modalData.reminder || 'none';
            document.getElementById('input-reminder-select').value = currentRemindVal;
            
            // Sync custom dropdown initial state
            const optionsList = document.querySelectorAll('.custom-dropdown-option');
            optionsList.forEach(opt => {
                if (opt.getAttribute('data-value') === currentRemindVal) {
                    opt.classList.add('active');
                    document.getElementById('selected-reminder-text').textContent = opt.querySelector('span').textContent;
                } else {
                    opt.classList.remove('active');
                }
            });
        }
    } catch (err) {
        alert("Error in goToStep(" + step + "): " + err.message + "\n" + err.stack);
    }
}

// Live clash validation checks in Step 3 event & todo modal
function initLiveClashDetector() {
    window.triggerLiveClashCheck = function(type) {
        const dateInput = document.getElementById(`input-${type}-date`);
        const startInput = document.getElementById(`input-${type}-start`);
        const endInput = document.getElementById(`input-${type}-end`);
        
        const warning = document.getElementById(`modal-${type}-clash-warning`);
        const warningText = document.getElementById(`modal-${type}-clash-text`);
        const warningTitle = document.getElementById(`modal-${type}-clash-title`);

        if (!dateInput || !startInput || !endInput || !warning) return;

        const dateVal = dateInput.value;
        const startVal = startInput.value;
        const endVal = endInput.value;

        if (dateVal && startVal && endVal) {
            if (startVal >= endVal) {
                warning.style.display = 'flex';
                if (warningTitle) warningTitle.textContent = "Peringatan Waktu Salah!";
                warningText.innerHTML = "Waktu mulai tidak boleh melebihi atau sama dengan waktu selesai.";
                return;
            }

            // Exclude current editing ID if in edit mode
            const excludeId = state.editingId ? state.editingId : null;
            const clash = findClash(dateVal, startVal, endVal, excludeId);
            
            if (clash) {
                warning.style.display = 'flex';
                if (warningTitle) warningTitle.textContent = "Peringatan Jadwal Bentrok!";
                warningText.innerHTML = `
                    Jadwal bertabrakan dengan:
                    <strong class="clash-event-title">${clash.title}</strong>
                    (${clash.startTime} - ${clash.endTime}).
                `;
            } else {
                warning.style.display = 'none';
            }
        } else {
            warning.style.display = 'none';
        }
    };

    const bindClash = (type) => {
        const dateInput = document.getElementById(`input-${type}-date`);
        const startInput = document.getElementById(`input-${type}-start`);
        const endInput = document.getElementById(`input-${type}-end`);
        
        if (!dateInput || !startInput || !endInput) return;

        const checkConflict = () => window.triggerLiveClashCheck(type);

        [dateInput, startInput, endInput].forEach(elem => {
            if (elem) {
                elem.addEventListener('change', checkConflict);
                elem.addEventListener('keyup', checkConflict);
            }
        });
    };

    bindClash('event');
    bindClash('todo');
}

function findClash(date, startTime, endTime, excludeId = null) {
    if (!date || !startTime || !endTime) return null;
    
    // Check against events
    let clash = state.schedules.find(ev => {
        if (excludeId && ev.id === excludeId) return false;
        if (ev.date !== date) return false;
        if (!ev.startTime || !ev.endTime) return false;
        return isTimeOverlapping(ev.startTime, ev.endTime, startTime, endTime);
    });
    
    if (clash) return clash;
    
    // Check against todos
    return state.todos.find(item => {
        if (excludeId && item.id === excludeId) return false;
        if (item.date !== date) return false;
        if (!item.startTime || !item.endTime) return false;
        return isTimeOverlapping(item.startTime, item.endTime, startTime, endTime);
    }) || null;
}

function checkClashBeforeStep4(type) {
    const tempItem = {
        title: state.modalData.title,
        date: state.modalData.date,
        startTime: state.modalData.startTime,
        endTime: state.modalData.endTime
    };

    const clash = findClash(tempItem.date, tempItem.startTime, tempItem.endTime, null);
    if (clash) {
        state.pendingSaveItem = tempItem;
        state.pendingSaveType = type;
        state.pendingSaveIsEdit = false;
        
        // Format dates for display
        const formatClashDate = (dateStr) => {
            const parts = dateStr.split('-');
            const day = parts[2];
            const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            const month = months[parseInt(parts[1]) - 1];
            const year = parts[0];
            return `${day} ${month} ${year}`;
        };
        
        const displayDate = formatClashDate(tempItem.date);
        
        // Populate comparison details
        const cardTitleNew = document.getElementById('clash-card-title-new');
        if (cardTitleNew) {
            if (type === 'event') {
                cardTitleNew.textContent = 'Event Yang Anda Tambahkan';
                cardTitleNew.style.color = '#2563eb'; // blue
            } else {
                cardTitleNew.textContent = 'To-Do Yang Anda Tambahkan';
                cardTitleNew.style.color = '#00828A'; // teal
            }
        }

        const newDotColor = type === 'event' ? '#3b82f6' : '#00828A';
        document.getElementById('clash-new-title').innerHTML = `<span class="dot-indicator" style="background-color: ${newDotColor};"></span>${tempItem.title}`;
        document.getElementById('clash-new-date').textContent = `${getDayNameIndo(tempItem.date)}, ${displayDate}`;
        const newTimeStr = (tempItem.startTime === tempItem.endTime) ? tempItem.startTime : `${tempItem.startTime} - ${tempItem.endTime}`;
        document.getElementById('clash-new-time').textContent = newTimeStr;
        
        const existDotColor = (clash.completed !== undefined) ? '#00828A' : '#ef4444';
        document.getElementById('clash-exist-title').innerHTML = `<span class="dot-indicator" style="background-color: ${existDotColor};"></span>${clash.title}`;
        document.getElementById('clash-exist-date').textContent = `${getDayNameIndo(clash.date)}, ${displayDate}`;
        const existTimeStr = (clash.startTime === clash.endTime) ? clash.startTime : `${clash.startTime} - ${clash.endTime}`;
        document.getElementById('clash-exist-time').textContent = existTimeStr;
        
        // Calculate new item duration in minutes
        const [sh, sm] = tempItem.startTime.split(':').map(Number);
        const [eh, em] = tempItem.endTime.split(':').map(Number);
        const duration = (eh * 60 + em) - (sh * 60 + sm);
        
        // Generate suggestions
        const suggestions = generateClashSuggestions(tempItem.date, duration);
        const listContainer = document.getElementById('clash-suggestions-list');
        listContainer.innerHTML = '';
        
        if (suggestions.length === 0) {
            listContainer.innerHTML = '<p class="text-sm text-slate-500 text-center py-2" style="grid-column: 1/-1;">Tidak ada saran waktu di hari ini.</p>';
        } else {
            suggestions.forEach(sug => {
                const btn = document.createElement('div');
                btn.className = 'clash-suggest-btn';
                btn.innerHTML = `
                    <p class="suggest-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${sug.startTime} - ${sug.endTime}</p>
                    <p class="suggest-date">${getDayNameIndo(tempItem.date)}, ${displayDate}</p>
                `;
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.clash-suggest-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    state.selectedClashSuggestion = sug;
                    document.getElementById('btn-clash-apply-recommendation').disabled = false;
                });
                listContainer.appendChild(btn);
            });
        }
        
        const applyBtn = document.getElementById('btn-clash-apply-recommendation');
        if (applyBtn) applyBtn.disabled = true;
        state.selectedClashSuggestion = null;
        
        closeAllModals();
        document.getElementById('modal-double-confirm-clash').style.display = 'flex';
    } else {
        goToStep(4);
    }
}

function handleClashOrSave(newItem, type, isEditMode = false) {
    const clash = findClash(newItem.date, newItem.startTime, newItem.endTime, isEditMode ? newItem.id : null);
    if (clash) {
        state.pendingSaveItem = newItem;
        state.pendingSaveType = type;
        state.pendingSaveIsEdit = isEditMode;
        
        // Format dates for display
        const formatClashDate = (dateStr) => {
            const parts = dateStr.split('-');
            const day = parts[2];
            const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
            const month = months[parseInt(parts[1]) - 1];
            const year = parts[0];
            return `${day} ${month} ${year}`;
        };
        
        const displayDate = formatClashDate(newItem.date);
        
        // Populate comparison details
        const cardTitleNew = document.getElementById('clash-card-title-new');
        if (cardTitleNew) {
            if (type === 'event') {
                cardTitleNew.textContent = 'Event Yang Anda Tambahkan';
                cardTitleNew.style.color = '#2563eb'; // blue
            } else {
                cardTitleNew.textContent = 'To-Do Yang Anda Tambahkan';
                cardTitleNew.style.color = '#00828A'; // teal
            }
        }

        const newDotColor = type === 'event' ? '#3b82f6' : '#00828A';
        document.getElementById('clash-new-title').innerHTML = `<span class="dot-indicator" style="background-color: ${newDotColor};"></span>${newItem.title}`;
        document.getElementById('clash-new-date').textContent = `${getDayNameIndo(newItem.date)}, ${displayDate}`;
        const newTimeStr = (newItem.startTime === newItem.endTime) ? newItem.startTime : `${newItem.startTime} - ${newItem.endTime}`;
        document.getElementById('clash-new-time').textContent = newTimeStr;
        
        const existDotColor = (clash.completed !== undefined) ? '#00828A' : '#ef4444';
        document.getElementById('clash-exist-title').innerHTML = `<span class="dot-indicator" style="background-color: ${existDotColor};"></span>${clash.title}`;
        document.getElementById('clash-exist-date').textContent = `${getDayNameIndo(clash.date)}, ${displayDate}`;
        const existTimeStr = (clash.startTime === clash.endTime) ? clash.startTime : `${clash.startTime} - ${clash.endTime}`;
        document.getElementById('clash-exist-time').textContent = existTimeStr;
        
        // Calculate new event duration in minutes
        const [sh, sm] = newItem.startTime.split(':').map(Number);
        const [eh, em] = newItem.endTime.split(':').map(Number);
        const duration = (eh * 60 + em) - (sh * 60 + sm);
        
        // Generate suggestions
        const suggestions = generateClashSuggestions(newItem.date, duration);
        const listContainer = document.getElementById('clash-suggestions-list');
        listContainer.innerHTML = '';
        
        state.selectedClashSuggestion = null;
        document.getElementById('btn-clash-apply-recommendation').disabled = true;
        
        suggestions.forEach((sug, idx) => {
            const btn = document.createElement('div');
            btn.className = 'clash-suggest-btn';
            btn.innerHTML = `
                <p class="suggest-time"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${sug.startTime} - ${sug.endTime}</p>
                <p class="suggest-date">${getDayNameIndo(newItem.date)}, ${displayDate}</p>
            `;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.clash-suggest-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.selectedClashSuggestion = sug;
                document.getElementById('btn-clash-apply-recommendation').disabled = false;
            });
            listContainer.appendChild(btn);
        });
        
        // Show Clash Modal
        document.getElementById('modal-double-confirm-clash').style.display = 'flex';
    } else {
        commitSave(newItem, type, isEditMode);
    }
}

function commitSave(item, type, isEditMode) {
    if (type === 'event') {
        if (isEditMode) {
            const idx = state.schedules.findIndex(s => s.id === item.id);
            if (idx > -1) state.schedules[idx] = item;
            showPushToast("Tersimpan", "Perubahan jadwal berhasil disimpan!");
        } else {
            state.schedules.push(item);
            showPushToast("Sukses", `Jadwal "${item.title}" berhasil ditambahkan.`);
        }
    } else {
        if (isEditMode) {
            const idx = state.todos.findIndex(t => t.id === item.id);
            if (idx > -1) state.todos[idx] = item;
            showPushToast("Tersimpan", "Perubahan to-do berhasil disimpan!");
        } else {
            state.todos.push(item);
            showPushToast("Sukses", `Tugas "${item.title}" berhasil dibuat.`);
        }
    }
    saveToStorage();
    closeAllModals();
    renderActiveView();
    if (isEditMode && document.getElementById('modal-date-detail').style.display === 'flex' && state.currentDetailDate) {
        window.openDateDetailModal(state.currentDetailDate);
    }
}

// Save complete wizard flow details
function saveWizardData() {
    if (state.modalType === 'event') {
        const newEvent = {
            id: state.editingId ? state.editingId : 'sched-' + Date.now(),
            title: state.modalData.title,
            date: state.modalData.date,
            startTime: state.modalData.startTime,
            endTime: state.modalData.endTime,
            category: state.modalData.category,
            location: state.modalData.location || '-',
            description: state.modalData.description || '',
            status: 'akan_datang',
            tag: capitalize(state.modalData.category),
            reminder: state.modalData.reminder
        };

        handleClashOrSave(newEvent, 'event', false);
    } 
    // Save to-do list items
    else {
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dayIndex = new Date(state.modalData.date).getDay();
        
        const newTodo = {
            id: state.editingId ? state.editingId : 'todo-' + Date.now(),
            title: state.modalData.title,
            day: dayNames[dayIndex],
            date: state.modalData.date,
            startTime: state.modalData.startTime,
            endTime: state.modalData.endTime,
            priority: state.modalData.priority,
            completed: false,
            description: state.modalData.description || '',
            reminder: state.modalData.reminder
        };

        handleClashOrSave(newTodo, 'todo', false);
    }
}

// ==========================================
// MONTH & YEAR SELECTOR MODAL ACTIONS
// ==========================================
let tempSelectedMonth = 5;
let tempSelectedYear = 2025;

function openPickerModal() {
    closeAllModals();
    tempSelectedMonth = state.selectedMonth;
    tempSelectedYear = state.selectedYear;

    document.getElementById('modal-month-picker').style.display = 'flex';
    syncPickerUI();
}

function closePickerModal() {
    document.getElementById('modal-month-picker').style.display = 'none';
}

function initPickerModalEvents() {
    // Month buttons
    const mBtns = document.querySelectorAll('.picker-months-grid .month-select-btn');
    mBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            mBtns.forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            tempSelectedMonth = parseInt(target.getAttribute('data-month'));
        });
    });

    // Year buttons
    const yBtns = document.querySelectorAll('.picker-year-selector .year-select-btn');
    yBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            yBtns.forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            tempSelectedYear = parseInt(target.getAttribute('data-year'));
        });
    });

    // Year scroll arrow clicks
    const btnUp = document.getElementById('btn-year-up');
    const btnDown = document.getElementById('btn-year-down');
    const scrollContainer = document.getElementById('picker-year-scroll');

    if (btnUp && scrollContainer) {
        btnUp.addEventListener('click', () => {
            scrollContainer.scrollTop -= 40;
        });
    }

    if (btnDown && scrollContainer) {
        btnDown.addEventListener('click', () => {
            scrollContainer.scrollTop += 40;
        });
    }
}

function syncPickerUI() {
    // Active month button
    const mBtns = document.querySelectorAll('.picker-months-grid .month-select-btn');
    mBtns.forEach(btn => {
        if (parseInt(btn.getAttribute('data-month')) === tempSelectedMonth) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Active year button
    const yBtns = document.querySelectorAll('.picker-year-selector .year-select-btn');
    yBtns.forEach(btn => {
        if (parseInt(btn.getAttribute('data-year')) === tempSelectedYear) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Scroll to active year inside scrollbox
    const activeYearBtn = document.querySelector('.picker-year-selector .year-select-btn.active');
    if (activeYearBtn) {
        activeYearBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

function applyPickerSelection() {
    state.selectedMonth = tempSelectedMonth;
    state.selectedYear = tempSelectedYear;
    
    // Reset the week offset when changing the month
    state.selectedMingguWeekOffset = 0;
    
    // Also sync grid view's month
    state.currentDate = new Date(state.selectedYear, state.selectedMonth, 1);
    
    saveToStorage();
    closePickerModal();
    renderActiveView();
}

// ==========================================
// CATEGORY MODAL ACTIONS
// ==========================================
function openCategoryModal() {
    closeAllModals();
    document.getElementById('modal-add-category').style.display = 'flex';
    
    // Reset inputs
    document.getElementById('input-cat-title').value = '';
    document.getElementById('input-cat-color').value = '#00828A';
    
    const circles = document.querySelectorAll('.color-selection-grid-new .color-circle');
    circles.forEach(c => c.classList.remove('active'));
    circles[0].classList.add('active');

    // Color picker circle handlers
    circles.forEach(c => {
        c.addEventListener('click', (e) => {
            circles.forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            document.getElementById('input-cat-color').value = target.getAttribute('data-color');
        });
    });
}

function closeCategoryModal() {
    document.getElementById('modal-add-category').style.display = 'none';
}

function saveCustomCategory() {
    const title = document.getElementById('input-cat-title').value;
    const color = document.getElementById('input-cat-color').value;

    const id = 'cat-' + Date.now();
    const newCat = { id, title, color };
    state.categories.push(newCat);
    
    saveToStorage();
    closeCategoryModal();
    
    // Add new custom filter pill dynamically to the Month view list
    const filtersGrp = document.querySelector('.calendar-filters-group');
    const addBtn = document.getElementById('btn-add-cat-modal');
    
    const pill = document.createElement('button');
    pill.className = 'filter-pill';
    pill.setAttribute('data-filter', id);
    pill.innerHTML = `<span class="dot-indicator" style="background-color: ${color}"></span> ${title}`;
    
    pill.addEventListener('click', (e) => {
        document.querySelectorAll('.calendar-filters-group .filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.selectedCategoryFilter = id;
        renderBulan();
    });

    filtersGrp.insertBefore(pill, addBtn);
    showPushToast("Sukses", `Kategori "${title}" ditambahkan.`);
}

// ==========================================
// SIMULATOR ACTIONS & PHONE MOCKUPS
// ==========================================
function updateSimulatorDropdown() {
    const select = document.getElementById('sim-agenda-select');
    if (!select) return;

    // Collect all schedules and todos
    const options = [];
    state.schedules.forEach(s => {
        options.push({ id: s.id, type: 'schedule', title: `Jadwal: ${s.title}`, date: s.date, time: s.startTime, detail: s.description, location: s.location });
    });
    state.todos.forEach(t => {
        options.push({ id: t.id, type: 'todo', title: `Tugas: ${t.title}`, date: t.date, time: '23:59', detail: t.description });
    });

    if (options.length === 0) {
        select.innerHTML = '<option value="">Tidak ada agenda terdaftar</option>';
        return;
    }

    const prevSel = select.value;
    select.innerHTML = options.map(opt => `
        <option value="${opt.type}_${opt.id}">${opt.title} (${formatDateIndo(opt.date)})</option>
    `).join('');

    if (prevSel) select.value = prevSel;
}

function triggerSimulatedAlert(channel) {
    const selectVal = document.getElementById('sim-agenda-select').value;
    if (!selectVal) return;

    const [type, id] = selectVal.split('_');
    let item = null;

    if (type === 'schedule') {
        item = state.schedules.find(s => s.id === id);
    } else {
        item = state.todos.find(t => t.id === id);
    }

    if (!item) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (channel === 'whatsapp') {
        const bubbles = document.getElementById('sim-wa-chat-bubbles');
        
        let msg = "";
        if (type === 'schedule') {
            msg = `Halo Nadia! Pengingat otomatis untuk agenda perkuliahan: <b>"${item.title}"</b> pada <b>${formatDateIndo(item.date)}</b> jam <b>${item.startTime} WIB</b> di <b>${item.location}</b>. Siapkan berkas tugasmu ya! 🚀`;
        } else {
            msg = `Halo Nadia! Tugas pentingmu: <b>"${item.title}"</b> akan segera dikumpulkan besok pukul <b>23:59 WIB</b>. Jangan ditunda ya! Semangat! 💪`;
        }

        bubbles.innerHTML = `
            <div class="chat-date">HARI INI</div>
            <div class="chat-bubble received">
                ${msg}
                <span class="bubble-time">${timeStr}</span>
            </div>
        `;
        showPushToast("WhatsApp Simulator", "Notifikasi chat dikirim ke HP Nadia.");
    } 
    else if (channel === 'email') {
        const sub = document.getElementById('sim-email-subject');
        const cont = document.getElementById('sim-email-content');

        if (type === 'schedule') {
            sub.textContent = `[PENGINGAT KULIAH] Agenda: ${item.title}`;
            cont.innerHTML = `
                Halo Nadia Saraswati,<br><br>
                Ini adalah pengingat perkuliahan Anda:<br><br>
                📖 <strong>Agenda:</strong> ${item.title}<br>
                📅 <strong>Tanggal:</strong> ${formatDateIndo(item.date)}<br>
                ⏰ <strong>Jam:</strong> ${item.startTime} - ${item.endTime} WIB<br>
                📍 <strong>Lokasi:</strong> ${item.location}<br><br>
                Salam hangat,<br>SchedPolines Admin Portal.
            `;
        } else {
            sub.textContent = `[DEADLINE REMINDER] Pengumpulan Tugas: ${item.title}`;
            cont.innerHTML = `
                Halo Nadia Saraswati,<br><br>
                Batas pengumpulan tugas Anda segera tiba:<br><br>
                📚 <strong>Tugas:</strong> ${item.title}<br>
                📅 <strong>Tanggal:</strong> ${formatDateIndo(item.date)}<br>
                ⏰ <strong>Batas Jam:</strong> 23:59 WIB<br><br>
                Segera submit file ke portal e-learning.<br><br>
                Salam hangat,<br>SchedPolines Admin Portal.
            `;
        }
        showPushToast("Email Simulator", "Email pengingat dikirim ke inbox Nadia.");
    }
}

// Mobile-styled floating push toast notification
function showPushToast(title, message) {
    const toast = document.createElement('div');
    toast.className = 'push-toast-banner';
    toast.innerHTML = `
        <div class="toast-icon-wrapper">🔔</div>
        <div class="toast-text-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('slide-in');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('slide-in');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function getDayNameIndo(dateStr) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const idx = new Date(dateStr).getDay();
    return days[idx];
}

function formatDateIndo(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const monthIdx = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${day} ${months[monthIdx]} ${year}`;
}

function getFormattedDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isTimeOverlapping(start1, end1, start2, end2) {
    const [hS1, mS1] = start1.split(':').map(Number);
    const [hE1, mE1] = end1.split(':').map(Number);
    const [hS2, mS2] = start2.split(':').map(Number);
    const [hE2, mE2] = end2.split(':').map(Number);

    const s1 = hS1 * 60 + mS1;
    const e1 = hE1 * 60 + mE1;
    const s2 = hS2 * 60 + mS2;
    const e2 = hE2 * 60 + mE2;

    return s1 < e2 && s2 < e1;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==========================================
// PROFILE CARD MODAL CONTROLLER FUNCTIONS
// ==========================================
function openProfileModal() {
    // Note: closing other modals + animation handled by animations.js patch
    loadProfileData(); // refresh before opening
    document.getElementById('modal-profile-card').style.display = 'flex';
}

function closeProfileModal() {
    document.getElementById('modal-profile-card').style.display = 'none';
}

function openEditProfileModal() {
    closeProfileModal();
    const user = currentUserProfile;
    
    if (user) {
        document.getElementById('edit-profile-name').value = user.name || '';
        document.getElementById('edit-profile-email').value = user.email || '';
        const role = user.role || 'Mahasiswa';
        document.getElementById('edit-profile-role').value = role;
        
        const roleItems = document.querySelectorAll('#role-dropdown-list li');
        roleItems.forEach(i => i.classList.remove('selected'));
        const matchedItem = Array.from(roleItems).find(i => i.getAttribute('data-role') === role);
        if (matchedItem) {
            matchedItem.classList.add('selected');
            const iconEl = matchedItem.querySelector('svg');
            const targetIcon = document.getElementById('edit-profile-role-icon');
            if (iconEl && targetIcon) targetIcon.innerHTML = iconEl.innerHTML;
        }
        const dobInput = document.getElementById('input-edit-profile-dob-date');
        if (dobInput) dobInput.value = user.dob || '';
        document.getElementById('edit-profile-phone').value = user.phone || '';
        document.getElementById('edit-profile-location').value = user.location || '';
        const editLetter = document.getElementById('edit-profile-avatar-letter');
        const editPreview = document.getElementById('edit-profile-img-preview');
        if (editLetter) {
            editLetter.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
            const colors = window.getUserAvatarColor ? window.getUserAvatarColor(user.name) : { bg: '#e2f0f0', text: 'var(--primary-teal)' };
            editLetter.style.backgroundColor = colors.bg;
            editLetter.style.color = colors.text;
        }
        
        if (user.photo) {
            if (editLetter) editLetter.style.display = 'none';
            if (editPreview) {
                editPreview.src = user.photo;
                editPreview.style.display = 'block';
            }
        } else {
            if (editLetter) editLetter.style.display = 'flex';
            if (editPreview) {
                editPreview.style.display = 'none';
                editPreview.src = '';
            }
        }
        window.calculateAgeFromDob();
    }
    document.getElementById('modal-edit-profile').style.display = 'flex';
}

function closeEditProfileModal() {
    document.getElementById('modal-edit-profile').style.display = 'none';
}

function loadProfileData() {
    if (currentUserProfile) {
        updateProfileDOM(currentUserProfile);
        checkProfileCompleteness(currentUserProfile);
    }
}
function updateProfileDOM(user) {
    // Header
    const headerAvatar = document.getElementById('header-avatar-letter');
    const headerAvatarImg = document.getElementById('header-avatar-img');
    const headerName = document.getElementById('header-profile-name');
    const headerRole = document.getElementById('header-profile-role');
    
    const colors = window.getUserAvatarColor ? window.getUserAvatarColor(user.name) : { bg: '#e2f0f0', text: 'var(--primary-teal)' };
    const headerAvatarContainer = document.getElementById('header-avatar-container');
    if (headerAvatar) {
        headerAvatar.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
    }
    if (headerAvatarContainer) {
        headerAvatarContainer.style.backgroundColor = colors.bg;
        headerAvatarContainer.style.color = colors.text;
    }
    
    if (user.photo) {
        if (headerAvatar) headerAvatar.style.display = 'none';
        if (headerAvatarImg) {
            headerAvatarImg.src = user.photo;
            headerAvatarImg.style.display = 'block';
        }
    } else {
        if (headerAvatar) headerAvatar.style.display = 'inline';
        if (headerAvatarImg) headerAvatarImg.style.display = 'none';
    }
    if (headerName) headerName.textContent = user.name ? user.name.split(' ')[0] : 'User';
    
    const roleText = user.role || 'Mahasiswa';
    if (headerRole) {
        headerRole.innerHTML = `${window.getRoleIconSvg ? window.getRoleIconSvg(roleText) : ''} <span>${roleText}</span>`;
        headerRole.style.display = 'flex';
        headerRole.style.alignItems = 'center';
        headerRole.style.gap = '6px';
    }
    
    // Profile Popup
    const displayName = document.getElementById('profile-display-name');
    const displayEmail = document.getElementById('profile-display-email');
    const displayRole = document.getElementById('profile-display-role');
    const displayAge = document.getElementById('profile-display-age');
    const displayPhone = document.getElementById('profile-display-phone');
    const displayLocation = document.getElementById('profile-display-location');
    const displayImg = document.getElementById('profile-card-img');
    
    if (displayName) displayName.textContent = user.name || '-';
    if (displayEmail) displayEmail.textContent = user.email || '-';
    if (displayRole) {
        const dRole = user.role || 'MAHASISWA';
        displayRole.innerHTML = `${window.getRoleIconSvg ? window.getRoleIconSvg(dRole) : ''} <span>${dRole.toUpperCase()}</span>`;
        displayRole.style.display = 'inline-flex';
        displayRole.style.alignItems = 'center';
        displayRole.style.gap = '6px';
    }
    if (displayPhone) displayPhone.textContent = user.phone || '-';
    if (displayLocation) displayLocation.textContent = user.location || '-';
    
    if (displayAge) {
        displayAge.textContent = calculateAgeStr(user.dob);
    }
    const displayLetter = document.getElementById('profile-card-avatar-letter');
    if (displayLetter) {
        displayLetter.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
        displayLetter.style.backgroundColor = colors.bg;
        displayLetter.style.color = colors.text;
    }
    
    if (user.photo) {
        if (displayLetter) displayLetter.style.display = 'none';
        if (displayImg) {
            displayImg.src = user.photo;
            displayImg.style.display = 'block';
        }
    } else {
        if (displayLetter) displayLetter.style.display = 'flex';
        if (displayImg) {
            displayImg.style.display = 'none';
            displayImg.src = '';
        }
    }
}

function checkProfileCompleteness(user) {
    const alertBanner = document.getElementById('incomplete-profile-alert');
    if (!alertBanner) return;
    
    if (!user.role || !user.dob || !user.location) {
        alertBanner.style.display = 'flex';
    } else {
        alertBanner.style.display = 'none';
    }
}

function calculateAgeStr(dob) {
    if (!dob) return '-';
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age + ' Tahun';
}

window.calculateAgeFromDob = function() {
    const dobEl = document.getElementById('input-edit-profile-dob-date');
    const dob = dobEl ? dobEl.value : '';
    const ageInput = document.getElementById('edit-profile-age');
    if (ageInput) {
        ageInput.value = calculateAgeStr(dob);
    }
};

window.toggleRoleDropdown = function(event) {
    event.stopPropagation();
    const list = document.getElementById('role-dropdown-list');
    if (list.style.display === 'none') {
        list.style.display = 'block';
    } else {
        list.style.display = 'none';
    }
};

window.handleProfileImageUpload = function(event) {
    const file = event.target.files[0];
    if (file) {
        // Validasi ukuran file (Max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert("Ukuran file terlalu besar! Maksimal 2MB.");
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = function() {
                // Buat canvas untuk kompresi agar di bawah 20KB (dan tidak melebihi limit 1MB Firestore)
                const canvas = document.createElement('canvas');
                const maxDim = 180; 
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Konversi ke JPEG kualitas 0.7 (sangat ringan)
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                
                const preview = document.getElementById('edit-profile-img-preview');
                if (preview) {
                    preview.src = compressedDataUrl;
                    preview.style.display = 'block';
                }
                const editLetter = document.getElementById('edit-profile-avatar-letter');
                if (editLetter) editLetter.style.display = 'none';
            };
        };
        reader.readAsDataURL(file);
    }
};

window.handleDeleteProfileImage = function() {
    const preview = document.getElementById('edit-profile-img-preview');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }
    const editLetter = document.getElementById('edit-profile-avatar-letter');
    if (editLetter) {
        editLetter.style.display = 'flex';
        const user = currentUserProfile;
        const name = user && user.name ? user.name : 'User';
        editLetter.textContent = name.charAt(0).toUpperCase();
        const colors = window.getUserAvatarColor ? window.getUserAvatarColor(name) : { bg: '#e2f0f0', text: 'var(--primary-teal)' };
        editLetter.style.backgroundColor = colors.bg;
        editLetter.style.color = colors.text;
    }
    document.getElementById('profile-upload-input').value = '';
};

window.handleSaveProfile = async function(event) {
    if (event) event.preventDefault();
    const saveBtn = document.querySelector('.btn-edit-save');
    const originalText = saveBtn ? saveBtn.textContent : "Simpan Perubahan";
    
    // Helper untuk timeout koneksi database
    const timeoutPromise = (ms) => new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Koneksi database timeout (5 detik). Pastikan layanan 'Firestore Database' sudah di-aktifkan (Create Database) di Firebase Console Anda.")), ms)
    );
    
    try {
        if (!auth.currentUser) throw new Error("Sesi login tidak valid.");
        if (!currentUserProfile) throw new Error("Data profil belum dimuat penuh.");
        
        // Tampilkan loading state agar user tidak me-refresh halaman saat proses upload
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = "Menyimpan...";
            saveBtn.style.opacity = "0.7";
            saveBtn.style.cursor = "not-allowed";
        }
        
        currentUserProfile.name = document.getElementById('edit-profile-name').value;
        currentUserProfile.email = document.getElementById('edit-profile-email').value;
        currentUserProfile.role = document.getElementById('edit-profile-role').value;
        const dobEl = document.getElementById('input-edit-profile-dob-date');
        currentUserProfile.dob = dobEl ? dobEl.value : '';
        currentUserProfile.phone = document.getElementById('edit-profile-phone').value;
        currentUserProfile.location = document.getElementById('edit-profile-location').value;
        
        const editPreview = document.getElementById('edit-profile-img-preview');
        const imgSrc = (editPreview && editPreview.style.display !== 'none') ? editPreview.src : '';
        if (imgSrc && imgSrc !== window.location.href) {
            currentUserProfile.photo = imgSrc;
        } else {
            currentUserProfile.photo = '';
        }
        
        // Simpan ke cloud dengan batas waktu 5 detik
        await Promise.race([
            db.collection('users').doc(auth.currentUser.email).set({ profile: currentUserProfile }, { merge: true }),
            timeoutPromise(5000)
        ]);
        
        // Tutup modal & update layar HANYA setelah sukses disimpan di cloud
        closeEditProfileModal();
        loadProfileData();
        
        if (window.showPushToast) {
            showPushToast("Profil Diperbarui", "Data profil Anda berhasil disimpan ke Cloud.");
        }
    } catch (err) {
        console.error("Save profile error:", err);
        alert("Sistem gagal menyimpan perubahan: " + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
            saveBtn.style.opacity = "1";
            saveBtn.style.cursor = "pointer";
        }
    }
};

document.addEventListener('click', function(e) {
    const roleDropdown = document.getElementById('role-dropdown-list');
    if (roleDropdown && roleDropdown.style.display === 'block') {
        const wrapper = document.getElementById('edit-role-wrapper');
        if (!wrapper.contains(e.target)) {
            roleDropdown.style.display = 'none';
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Role dropdown selection
    const roleItems = document.querySelectorAll('#role-dropdown-list li');
    roleItems.forEach(item => {
        item.addEventListener('click', function() {
            roleItems.forEach(i => i.classList.remove('selected'));
            this.classList.add('selected');
            document.getElementById('edit-profile-role').value = this.getAttribute('data-role');
            
            const iconEl = this.querySelector('svg');
            const targetIcon = document.getElementById('edit-profile-role-icon');
            if (iconEl && targetIcon) targetIcon.innerHTML = iconEl.innerHTML;
            
            document.getElementById('role-dropdown-list').style.display = 'none';
        });
    });
});


window.selectHariDate = function(dateStr) {
    state.selectedHariDate = dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        state.selectedYear = parseInt(parts[0], 10);
        state.selectedMonth = parseInt(parts[1], 10) - 1; // 0-indexed
    }
    renderHari();
};

window.toggleHariFilterMenu = function() {
    const list = document.getElementById('hari-filter-list');
    const container = document.getElementById('hari-filter-container');
    if (list && container) {
        if (list.style.display === 'none' || list.style.display === '') {
            list.style.display = 'flex';
            container.classList.add('open');
        } else {
            list.style.display = 'none';
            container.classList.remove('open');
        }
    }
};

window.applyHariFilter = function(filterStatus) {
    if (state.selectedHariFilter === filterStatus) {
        state.selectedHariFilter = 'all'; // Toggle off
    } else {
        state.selectedHariFilter = filterStatus;
    }
    
    // Close the menu
    const list = document.getElementById('hari-filter-list');
    const container = document.getElementById('hari-filter-container');
    if (list) list.style.display = 'none';
    if (container) container.classList.remove('open');
    
    renderHari();
};

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
    const filterList = document.getElementById('hari-filter-list');
    const container = document.getElementById('hari-filter-container');
    if (filterList && filterList.style.display === 'flex' && !e.target.closest('.filter-dropdown-container')) {
        filterList.style.display = 'none';
        if (container) container.classList.remove('open');
    }
});

// Clash modal helper functions
window.generateClashSuggestions = function(eventDate, newEventDurationMinutes) {
    const allItems = [...state.schedules, ...state.todos];
    const dayEvents = allItems.filter(s => s.date === eventDate && s.startTime)
        .sort((a,b) => a.startTime.localeCompare(b.startTime));
    
    const suggestions = [];
    const possibleStarts = ['08:00', '09:30', '11:30', '13:00', '14:30', '16:00', '17:30'];
    
    for (let start of possibleStarts) {
        const [h, m] = start.split(':').map(Number);
        const endMinutes = h * 60 + m + newEventDurationMinutes;
        const endHour = Math.floor(endMinutes / 60) % 24;
        const endMin = endMinutes % 60;
        const end = `${String(endHour).padStart(2,'0')}:${String(endMin).padStart(2,'0')}`;
        
        // check overlap
        const isOverlap = dayEvents.some(s => isTimeOverlapping(s.startTime, s.endTime, start, end));
        if (!isOverlap && suggestions.length < 3) {
            suggestions.push({ startTime: start, endTime: end });
        }
    }
    
    // fallback if no suggestions found
    while (suggestions.length < 3) {
        const fallbackSlots = [
            { startTime: '11:30', endTime: '13:00' },
            { startTime: '13:00', endTime: '15:30' },
            { startTime: '16:30', endTime: '17:00' }
        ];
        suggestions.push(fallbackSlots[suggestions.length]);
    }
    return suggestions;
};

window.closeClashModal = function() {
    document.getElementById('modal-double-confirm-clash').style.display = 'none';
    state.pendingSaveItem = null;
    state.selectedClashSuggestion = null;
};

window.closeClashModalAndEdit = function() {
    try {
        document.getElementById('modal-double-confirm-clash').style.display = 'none';
        
        if (state.pendingSaveIsEdit) {
            if (state.pendingSaveType === 'event') {
                document.getElementById('modal-edit-agenda').style.display = 'flex';
            } else {
                document.getElementById('modal-edit-todo').style.display = 'flex';
            }
        } else {
            if (state.pendingSaveType) {
                state.modalType = state.pendingSaveType;
            }
            goToStep(3);
        }
    } catch (err) {
        alert("Error in closeClashModalAndEdit: " + err.message + "\n" + err.stack);
    }
};

// ==========================================
// CUSTOM REMINDER MODAL LOGIC
// =========// ==========================================
// CUSTOM REMINDER MODAL LOGIC
// ==========================================
let tempPreviousReminderVal = 'none';

window.openCustomReminderModal = function() {
    // Initialize state
    let freq = state.modalData.customReminderFreq || 'sekali';
    let valStr = state.modalData.customReminderStr || '';
    
    // Set default labels
    const sNum = document.getElementById('select-sekali-num');
    const sUnit = document.getElementById('select-sekali-unit');
    const bNum = document.getElementById('select-berulang-num');
    const bUnit = document.getElementById('select-berulang-unit');
    
    if (sNum) document.getElementById('selected-sekali-num-text').textContent = sNum.value;
    if (sUnit) document.getElementById('selected-sekali-unit-text').textContent = sUnit.value;
    if (bNum) document.getElementById('selected-berulang-num-text').textContent = bNum.value;
    if (bUnit) document.getElementById('selected-berulang-unit-text').textContent = bUnit.value;
    
    // Try to parse existing string to pre-populate custom inputs
    if (valStr) {
        if (valStr.startsWith('Setiap ')) {
            freq = 'berulang';
            const parts = valStr.replace('Setiap ', '').split(' ');
            if (parts.length >= 2) {
                window.selectCustomSubOption('select-berulang-num', 'selected-berulang-num-text', 'berulang-num-options', parts[0]);
                window.selectCustomSubOption('select-berulang-unit', 'selected-berulang-unit-text', 'berulang-unit-options', parts[1]);
            }
        } else if (valStr.endsWith(' sebelum')) {
            freq = 'sekali';
            const parts = valStr.replace(' sebelum', '').split(' ');
            if (parts.length >= 2) {
                window.selectCustomSubOption('select-sekali-num', 'selected-sekali-num-text', 'sekali-num-options', parts[0]);
                window.selectCustomSubOption('select-sekali-unit', 'selected-sekali-unit-text', 'sekali-unit-options', parts[1]);
            }
        }
    }
    
    window.setReminderFrequency(freq);
    document.getElementById('modal-custom-reminder').style.display = 'flex';
};

document.addEventListener('DOMContentLoaded', () => {
    const remindSelect = document.getElementById('input-reminder-select');
    if (remindSelect) {
        remindSelect.addEventListener('change', function(e) {
            if (this.value === 'custom') {
                window.openCustomReminderModal();
            } else {
                tempPreviousReminderVal = this.value;
            }
        });
    }
});

window.closeCustomReminderModal = function() {
    document.getElementById('modal-custom-reminder').style.display = 'none';
    const select = document.getElementById('input-reminder-select');
    if (select && select.value === 'custom') {
        select.value = tempPreviousReminderVal || 'none';
        
        // Sync custom dropdown trigger text back
        const customOpt = document.querySelector(`.custom-dropdown-option[data-value="${tempPreviousReminderVal}"]`);
        if (customOpt) {
            document.getElementById('selected-reminder-text').textContent = customOpt.querySelector('span').textContent;
            document.querySelectorAll('.custom-dropdown-option').forEach(opt => {
                opt.classList.toggle('active', opt.getAttribute('data-value') === tempPreviousReminderVal);
            });
        }
    }
};

window.setReminderFrequency = function(freq) {
    state.customReminderFrequency = freq;
    
    const cardSekali = document.getElementById('freq-card-sekali');
    const cardBerulang = document.getElementById('freq-card-berulang');
    
    if (freq === 'sekali') {
        cardSekali?.classList.add('active');
        cardBerulang?.classList.remove('active');
        document.getElementById('panel-remind-sekali').style.display = 'block';
        document.getElementById('panel-remind-berulang').style.display = 'none';
        document.getElementById('berulang-summary-banner').style.visibility = 'hidden';
    } else {
        cardSekali?.classList.remove('active');
        cardBerulang?.classList.add('active');
        document.getElementById('panel-remind-sekali').style.display = 'none';
        document.getElementById('panel-remind-berulang').style.display = 'block';
        document.getElementById('berulang-summary-banner').style.visibility = 'visible';
    }
    
    window.updateCustomReminderSummary();
};

window.updateCustomReminderSummary = function() {
    const freq = state.customReminderFrequency || 'sekali';
    
    if (freq === 'sekali') {
        const num = document.getElementById('select-sekali-num').value;
        const unit = document.getElementById('select-sekali-unit').value;
        
        const summaryText = document.getElementById('sekali-summary-text-box');
        if (summaryText) {
            summaryText.textContent = `Pengingat akan dikirim ${num} ${unit} sebelum deadline tugas`;
        }
    } else {
        const num = document.getElementById('select-berulang-num').value;
        const unit = document.getElementById('select-berulang-unit').value;
        const stopOnComplete = document.getElementById('check-stop-on-complete').checked;
        
        const summaryText = document.getElementById('berulang-summary-text-box');
        if (summaryText) {
            const today = new Date();
            const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const formattedDate = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
            
            // Format hour to HH.MM
            const hours = String(today.getHours()).padStart(2, '0');
            const minutes = String(today.getMinutes()).padStart(2, '0');
            const formattedTime = `${hours}.${minutes}`;
            
            let stopText = stopOnComplete ? 'hingga status tugas ditandai sebagai selesai atau melewati deadline.' : 'hingga melewati deadline.';
            summaryText.innerHTML = `Sistem akan mengirimkan pengingat <strong>setiap ${num} ${unit}</strong> mulai dari <strong>${formattedDate} pukul ${formattedTime}</strong> ${stopText}`;
        }
    }
};

window.saveCustomReminder = function() {
    const freq = state.customReminderFrequency || 'sekali';
    let customString = '';
    
    if (freq === 'sekali') {
        const num = document.getElementById('select-sekali-num').value;
        const unit = document.getElementById('select-sekali-unit').value;
        customString = `${num} ${unit} sebelum`;
    } else {
        const num = document.getElementById('select-berulang-num').value;
        const unit = document.getElementById('select-berulang-unit').value;
        customString = `Setiap ${num} ${unit}`;
    }
    
    const select = document.getElementById('input-reminder-select');
    if (select) {
        let customOption = select.querySelector('option[value="custom"]');
        if (customOption) {
            customOption.value = customString;
            customOption.textContent = customString;
        }
        select.value = customString;
        tempPreviousReminderVal = customString;
    }
    
    const customOpt = document.querySelector('.custom-dropdown-option[data-value="custom"]');
    if (customOpt) {
        customOpt.querySelector('span').textContent = customString;
        document.getElementById('selected-reminder-text').textContent = customString;
        
        const optionsList = document.querySelectorAll('.custom-dropdown-option');
        optionsList.forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-value') === 'custom');
        });
    }
    
    if (state.customReminderTarget) {
        const inputReminder = document.getElementById(`input-${state.customReminderTarget}-reminder`);
        if (inputReminder) inputReminder.value = customString;
        
        const selectedText = document.getElementById(`selected-${state.customReminderTarget}-reminder-text`);
        if (selectedText) selectedText.textContent = customString;
        
        state.customReminderTarget = null;
    }
    
    state.modalData.customReminderStr = customString;
    state.modalData.customReminderFreq = freq;
    
    document.getElementById('modal-custom-reminder').style.display = 'none';
};

window.toggleCustomDropdown = function() {
    const options = document.getElementById('reminder-custom-options');
    if (options) {
        options.classList.toggle('show');
    }
};

window.selectDropdownOption = function(value) {
    const select = document.getElementById('input-reminder-select');
    if (select) {
        // If the selected value is a custom value, we need to handle it
        const standardValues = ['none', '5_before', '15_before', '30_before', '1_before', 'custom'];
        
        if (value === 'custom') {
            select.value = 'custom';
            // Open custom modal
            window.openCustomReminderModal();
        } else {
            select.value = value;
            tempPreviousReminderVal = value;
            
            const optionsList = document.querySelectorAll('.custom-dropdown-option');
            optionsList.forEach(opt => {
                if (opt.getAttribute('data-value') === value) {
                    opt.classList.add('active');
                    document.getElementById('selected-reminder-text').textContent = opt.querySelector('span').textContent;
                } else {
                    opt.classList.remove('active');
                }
            });
        }
    }
    
    document.getElementById('reminder-custom-options')?.classList.remove('show');
};

window.toggleCustomSubDropdown = function(optionsId) {
    // Close other sub-dropdowns to prevent overlap
    const ids = ['sekali-num-options', 'sekali-unit-options', 'berulang-num-options', 'berulang-unit-options'];
    ids.forEach(id => {
        if (id !== optionsId) {
            document.getElementById(id)?.classList.remove('show');
        }
    });
    
    const options = document.getElementById(optionsId);
    if (options) {
        options.classList.toggle('show');
    }
};

window.selectCustomSubOption = function(selectId, triggerTextId, optionsId, value) {
    const select = document.getElementById(selectId);
    if (select) {
        select.value = value;
        
        const triggerText = document.getElementById(triggerTextId);
        if (triggerText) {
            triggerText.textContent = value;
        }
        
        const optionsList = document.querySelectorAll(`#${optionsId} .custom-dropdown-option`);
        optionsList.forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-value') === value);
        });
        
        const event = new Event('change');
        select.dispatchEvent(event);
    }
    document.getElementById(optionsId)?.classList.remove('show');
};

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    // Main custom reminder dropdown
    const mainDropdown = document.getElementById('reminder-custom-dropdown');
    if (mainDropdown && !mainDropdown.contains(e.target)) {
        document.getElementById('reminder-custom-options')?.classList.remove('show');
    }
    
    // Custom sub-dropdowns
    const subDropdowns = [
        { dropdown: 'sekali-num-dropdown', options: 'sekali-num-options' },
        { dropdown: 'sekali-unit-dropdown', options: 'sekali-unit-options' },
        { dropdown: 'berulang-num-dropdown', options: 'berulang-num-options' },
        { dropdown: 'berulang-unit-dropdown', options: 'berulang-unit-options' }
    ];
    
    subDropdowns.forEach(dd => {
        const dropdownEl = document.getElementById(dd.dropdown);
        const optionsEl = document.getElementById(dd.options);
        if (dropdownEl && !dropdownEl.contains(e.target)) {
            optionsEl?.classList.remove('show');
        }
    });
});


// ==========================================
// HORIZONTAL DATE STRIP SELECTOR LOGIC
// ==========================================
window.renderHorizontalMonthStrip = function() {
    const listContainer = document.getElementById("strip-months-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    const monthNamesShort = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", 'NOV', 'DES'];
    
    for (let i = 0; i < 12; i++) {
        const isActive = (i === state.selectedMonth) ? "active" : "";
        
        const capsule = document.createElement("div");
        capsule.className = `strip-month-capsule ${isActive}`;
        capsule.id = `strip-month-${i}`;
        capsule.innerHTML = monthNamesShort[i];
        
        capsule.addEventListener("click", () => {
            state.selectedMonth = i;
            
            const parts = state.selectedHariDate.split('-');
            if (parts.length === 3) {
                let yyyy = parseInt(parts[0], 10);
                let dd = parseInt(parts[2], 10);
                
                const maxDays = new Date(yyyy, i + 1, 0).getDate();
                if (dd > maxDays) {
                    dd = maxDays;
                }
                
                const mm = String(i + 1).padStart(2, "0");
                const newDateStr = `${yyyy}-${mm}-${String(dd).padStart(2, "0")}`;
                
                selectHariDate(newDateStr);
            }
        });
        
        listContainer.appendChild(capsule);
    }
    
    // Auto-scroll to selected month
    setTimeout(() => {
        const activeCapsule = document.getElementById(`strip-month-${state.selectedMonth}`);
        if (activeCapsule && listContainer) {
            listContainer.scrollLeft = activeCapsule.offsetLeft - (listContainer.offsetWidth / 2) + (activeCapsule.offsetWidth / 2);
        }
    }, 10);
};

window.shiftMonthStrip = function(offset) {
    const listContainer = document.getElementById("strip-months-list");
    if (listContainer) {
        listContainer.scrollBy({ left: offset * 100, behavior: 'smooth' });
    }
};

window.renderHorizontalDateStrip = function() {
    const listContainer = document.getElementById("strip-days-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const monthNamesShort = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", 'NOV', 'DES'];
    
    if (state.searchQuery) {
        // Filtered mode: show only dates containing agendas matching the search keyword
        let matchingSchedules = state.schedules.filter(s => 
            s.title.toLowerCase().includes(state.searchQuery) ||
            (s.description && s.description.toLowerCase().includes(state.searchQuery)) ||
            (s.location && s.location.toLowerCase().includes(state.searchQuery))
        );
        
        let matchingDates = [...new Set(matchingSchedules.map(s => s.date))];
        matchingDates.sort(); // Sort chronologically
        
        if (matchingDates.length === 0) {
            listContainer.innerHTML = `<div style="color: #94a3b8; font-style: italic; font-size: 13px; padding: 10px; width: 100%; text-align: center;">Tidak ada tanggal yang cocok</div>`;
            return;
        }
        
        // Auto-select the first matching date if the current selected date has no matches
        if (!matchingDates.includes(state.selectedHariDate)) {
            state.selectedHariDate = matchingDates[0];
            const parts = state.selectedHariDate.split('-');
            if (parts.length === 3) {
                state.selectedYear = parseInt(parts[0], 10);
                state.selectedMonth = parseInt(parts[1], 10) - 1;
            }
        }
        
        matchingDates.forEach(dateStr => {
            const parts = dateStr.split('-');
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const dayNum = d.getDate();
            const dayName = dayNames[d.getDay()];
            const monthText = monthNamesShort[d.getMonth()];
            const isActive = (dateStr === state.selectedHariDate) ? "active" : "";
            
            const capsule = document.createElement("div");
            capsule.className = `strip-day-capsule ${isActive}`;
            capsule.innerHTML = `
                <span class="day-num">${dayNum}</span>
                <span class="day-name">${dayName}</span>
            `;
            
            capsule.addEventListener("click", () => {
                selectHariDate(dateStr);
            });
            
            listContainer.appendChild(capsule);
        });
    } else {
        // Render only days of the currently selected month
        const currentYear = state.selectedYear;
        const currentMonthIndex = state.selectedMonth;
        
        const maxDays = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
        
        for (let i = 1; i <= maxDays; i++) {
            const d = new Date(currentYear, currentMonthIndex, i);
            
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const dateStr = `${yyyy}-${mm}-${dd}`;
            
            const dayNum = d.getDate();
            const dayName = dayNames[d.getDay()];
            
            const isActive = (dateStr === state.selectedHariDate) ? "active" : "";
            
            const capsule = document.createElement("div");
            capsule.className = `strip-day-capsule ${isActive}`;
            capsule.id = `strip-date-${dateStr}`;
            capsule.innerHTML = `
                <span class="day-num">${dayNum}</span>
                <span class="day-name">${dayName}</span>
            `;
            
            capsule.addEventListener("click", () => {
                selectHariDate(dateStr);
            });
            
            listContainer.appendChild(capsule);
        }
        
        // Auto-scroll to selected date
        setTimeout(() => {
            const activeCapsule = document.getElementById(`strip-date-${state.selectedHariDate}`);
            if (activeCapsule && listContainer) {
                // center it
                listContainer.scrollLeft = activeCapsule.offsetLeft - (listContainer.offsetWidth / 2) + (activeCapsule.offsetWidth / 2);
            }
        }, 10);
    }
};

window.shiftStripDate = function(offset) {
    const listContainer = document.getElementById("strip-days-list");
    if (!listContainer) return;
    
    // offset is usually -7 or 7, let's map it to a scroll amount
    const scrollAmount = offset > 0 ? 300 : -300;
    listContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
};


// ==========================================
// TIME SELECTOR MANUAL INPUT LOGIC
// ==========================================
window.manualTimeInput = function(type, value, prefix = 'event') {
    const input = document.getElementById(`input-${prefix}-${type}`);
    if (!input) return;

    // Filter to digits only
    let clean = value.replace(/\D/g, "");
    
    // Auto-restrict hour digits (first 2 digits) to max 23
    if (clean.length >= 2) {
        let hour = parseInt(clean.substring(0, 2), 10);
        if (hour > 23) hour = 23;
        clean = String(hour).padStart(2, "0") + clean.substring(2);
    }
    
    // Auto-restrict minute digits (last 2 digits) to max 59
    if (clean.length >= 4) {
        let minute = parseInt(clean.substring(2, 4), 10);
        if (minute > 59) minute = 59;
        clean = clean.substring(0, 2) + String(minute).padStart(2, "0");
    }

    if (clean.length > 4) clean = clean.substring(0, 4);

    // Auto-insert ":" separator if 3 or 4 digits are present
    let formatted = clean;
    if (clean.length >= 3) {
        formatted = clean.substring(0, 2) + ":" + clean.substring(2);
    }

    input.value = formatted;

    // Trigger conflict logic only if formatted value represents a complete valid HH:MM string (5 chars)
    if (formatted.length === 5) {
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (timeRegex.test(formatted)) {
            // Fire change event to run the validator
            const changeEvent = new Event("change");
            input.dispatchEvent(changeEvent);
        }
    }
};


// ==========================================
// CATEGORY DROPDOWN LOGIC
// ==========================================
window.toggleCatDropdown = function(event) {
    event.stopPropagation();
    const options = document.getElementById("cat-custom-options");
    if (options) {
        options.classList.toggle("show");
    }
};

window.selectCatOption = function(value) {
    const select = document.getElementById("input-event-cat");
    if (select) {
        select.value = value;
    }
    
    // Update trigger UI
    const textSpan = document.getElementById("selected-cat-text");
    const dotSpan = document.getElementById("selected-cat-dot");
    if (textSpan && dotSpan) {
        const catMap = {
            meeting: { text: "Meeting", dot: "blue" },
            deadline: { text: "Deadline", dot: "red" },
            review: { text: "Review", dot: "yellow" },
            personal: { text: "Personal", dot: "green" }
        };
        
        const data = catMap[value] || catMap.meeting;
        textSpan.textContent = data.text;
        dotSpan.className = `dot-indicator ${data.dot}`;
    }
    
    // Toggle active classes on options
    const optionsList = document.querySelectorAll("#cat-custom-options .custom-dropdown-option");
    optionsList.forEach(opt => {
        if (opt.getAttribute("data-value") === value) {
            opt.classList.add("active");
        } else {
            opt.classList.remove("active");
        }
    });
    
    // Close options list
    document.getElementById("cat-custom-options")?.classList.remove("show");
};

// Close category dropdown when clicking outside
document.addEventListener("click", (e) => {
    const dropdown = document.getElementById("cat-custom-dropdown");
    if (dropdown && !dropdown.contains(e.target)) {
        document.getElementById("cat-custom-options")?.classList.remove("show");
    }
});


// ==========================================
// CUSTOM DATE PICKER DROPDOWNS LOGIC
// ==========================================
state.eventPickerDate = new Date();
state.todoPickerDate = new Date();
state.eventPickerView = "calendar"; // "calendar", "months", "years"
state.todoPickerView = "calendar";
state.eventTempDate = ""; // highlighted but not confirmed YYYY-MM-DD
state.todoTempDate = "";

window.syncDatePickerText = function(type, dateVal) {
    const textSpan = document.getElementById(`selected-${type}-date-text`);
    if (textSpan && dateVal) {
        const parts = dateVal.split("-");
        if (parts.length === 3) {
            textSpan.textContent = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
            textSpan.textContent = dateVal;
        }
    }
};

window.toggleDatePicker = function(type, event) {
    event.stopPropagation();
    document.querySelectorAll(".custom-dropdown-options").forEach(el => {
        if (el.id !== `${type}-date-options`) el.classList.remove("show");
    });
    
    const options = document.getElementById(`${type}-date-options`);
    if (options) {
        const isShow = options.classList.toggle("show");
        if (isShow) {
            const inputVal = document.getElementById(`input-${type}-date`).value || getFormattedDateString(new Date());
            state[`${type}TempDate`] = inputVal;
            state[`${type}PickerDate`] = new Date(inputVal);
            state[`${type}PickerView`] = "calendar"; // reset to default calendar view
            window.renderDatePickerCalendar(type);
        }
    }
};

window.onDatePickerTitleClick = function(type, event) {
    event.stopPropagation();
    const currentView = state[`${type}PickerView`];
    if (currentView === "calendar") {
        state[`${type}PickerView`] = "months";
    } else if (currentView === "months") {
        state[`${type}PickerView`] = "years";
    }
    window.renderDatePickerCalendar(type);
};

window.onDatePickerHeaderNav = function(type, direction, event) {
    event.stopPropagation();
    const currentView = state[`${type}PickerView`];
    const d = state[`${type}PickerDate`];
    if (!d) return;

    if (currentView === "calendar") {
        // Nav by 1 month
        d.setMonth(d.getMonth() + direction);
    } else if (currentView === "months") {
        // Nav by 1 year
        d.setFullYear(d.getFullYear() + direction);
    } else if (currentView === "years") {
        // Nav by 12 years
        d.setFullYear(d.getFullYear() + (direction * 12));
    }
    window.renderDatePickerCalendar(type);
};

window.onDatePickerQuickSelect = function(type, period, event) {
    event.stopPropagation();
    const target = new Date();
    if (period === "tomorrow") {
        target.setDate(target.getDate() + 1);
    } else if (period === "next-week") {
        target.setDate(target.getDate() + 7);
    }
    const dateStr = getFormattedDateString(target);
    state[`${type}TempDate`] = dateStr;
    state[`${type}PickerDate`] = new Date(dateStr);
    state[`${type}PickerView`] = "calendar";
    window.renderDatePickerCalendar(type);
};

window.selectDatePickerCell = function(type, cellType, value, event) {
    event.stopPropagation();
    const d = state[`${type}PickerDate`];
    if (!d) return;

    if (cellType === "day") {
        state[`${type}TempDate`] = value; // string YYYY-MM-DD
        window.renderDatePickerCalendar(type); // update calendar selection state
    } else if (cellType === "month") {
        d.setMonth(value); // value is integer 0-11
        state[`${type}PickerView`] = "calendar";
        window.renderDatePickerCalendar(type);
    } else if (cellType === "year") {
        d.setFullYear(value); // value is integer
        state[`${type}PickerView`] = "months";
        window.renderDatePickerCalendar(type);
    }
};

window.confirmDatePickerVal = function(type, event) {
    event?.stopPropagation();
    const input = document.getElementById(`input-${type}-date`);
    const dateStr = state[`${type}TempDate`];
    if (input && dateStr) {
        input.value = dateStr;
        window.syncDatePickerText(type, dateStr);
        const changeEvent = new Event("change");
        input.dispatchEvent(changeEvent);
    }
    window.closeDatePicker(type, event);
};

window.closeDatePicker = function(type, event) {
    event?.stopPropagation();
    document.getElementById(`${type}-date-options`)?.classList.remove("show");
};

window.renderDatePickerCalendar = function(type) {
    const container = document.getElementById(`${type}-date-options`);
    const pickerDate = state[`${type}PickerDate`];
    const currentView = state[`${type}PickerView`] || "calendar";
    const tempDate = state[`${type}TempDate`];
    
    if (!container || !pickerDate) return;
    
    const year = pickerDate.getFullYear();
    const month = pickerDate.getMonth();
    
    const indonesianMonths = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    
    let html = `<div class="dp-panel-container">`;
    
    // 1. Render Quick Selectors (only visible in main calendar view)
    if (currentView === "calendar" && type !== 'edit-profile-dob') {
        html += `
            <div class="dp-quick-selectors">
                <button type="button" class="dp-quick-btn" onclick="window.onDatePickerQuickSelect('${type}', 'today', event)">Hari Ini</button>
                <button type="button" class="dp-quick-btn" onclick="window.onDatePickerQuickSelect('${type}', 'tomorrow', event)">Besok</button>
                <button type="button" class="dp-quick-btn" onclick="window.onDatePickerQuickSelect('${type}', 'next-week', event)">Minggu Depan</button>
            </div>
        `;
    }
    
    // 2. Render Header Row
    let titleText = "";
    if (currentView === "calendar") {
        titleText = `${indonesianMonths[month]} ${year}`;
    } else if (currentView === "months") {
        titleText = `${year}`;
    } else if (currentView === "years") {
        const startY = year - (year % 12);
        titleText = `${startY} - ${startY + 11}`;
    }
    
    html += `
        <div class="dp-header">
            <button type="button" class="dp-nav-btn" onclick="window.onDatePickerHeaderNav('${type}', -1, event)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <span class="dp-title-clickable" onclick="window.onDatePickerTitleClick('${type}', event)">${titleText}</span>
            <button type="button" class="dp-nav-btn" onclick="window.onDatePickerHeaderNav('${type}', 1, event)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        </div>
        <div class="dp-body-content">
    `;
    
    // 3. Render Body Grid based on view
    if (currentView === "calendar") {
        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        
        html += `
            <div class="dp-weekdays">
                <span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span>
            </div>
            <div class="dp-days-grid">
        `;
        
        for (let i = 0; i < firstDayIndex; i++) {
            html += '<div class="dp-day-cell empty"></div>';
        }
        
        for (let day = 1; day <= totalDays; day++) {
            const fullDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isActive = (fullDateStr === tempDate) ? "active" : "";
            html += `
                <div class="dp-day-cell ${isActive}" onclick="window.selectDatePickerCell('${type}', 'day', '${fullDateStr}', event)">
                    ${day}
                </div>
            `;
        }
        html += `</div>`;
    } else if (currentView === "months") {
        const monthsShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
        html += `<div class="dp-grid-12">`;
        monthsShort.forEach((mName, idx) => {
            const isAct = (idx === month) ? "active" : "";
            html += `
                <div class="dp-grid-item ${isAct}" onclick="window.selectDatePickerCell('${type}', 'month', ${idx}, event)">
                    ${mName}
                </div>
            `;
        });
        html += `</div>`;
    } else if (currentView === "years") {
        const startY = year - (year % 12);
        html += `<div class="dp-grid-12">`;
        for (let y = startY; y < startY + 12; y++) {
            const isAct = (y === year) ? "active" : "";
            html += `
                <div class="dp-grid-item ${isAct}" onclick="window.selectDatePickerCell('${type}', 'year', ${y}, event)">
                    ${y}
                </div>
            `;
        }
        html += `</div>`;
    }
    
    html += `
        </div>
        <div class="dp-footer">
            <button type="button" class="dp-footer-btn cancel" onclick="window.closeDatePicker('${type}', event)">Batal</button>
            <button type="button" class="dp-footer-btn enter" onclick="window.confirmDatePickerVal('${type}', event)">Pilih</button>
        </div>
    </div>
    `;
    
    container.innerHTML = html;
};

document.addEventListener("click", (e) => {
    const eventDp = document.getElementById("event-date-custom-dropdown");
    const todoDp = document.getElementById("todo-date-custom-dropdown");
    const editAgendaDp = document.getElementById("edit-agenda-date-dropdown");
    const editTodoDp = document.getElementById("edit-todo-date-dropdown");
    
    if (eventDp && !eventDp.contains(e.target) && !document.getElementById('event-date-trigger')?.contains(e.target)) {
        document.getElementById("event-date-options")?.classList.remove("show");
    }
    if (todoDp && !todoDp.contains(e.target) && !document.getElementById('todo-date-trigger')?.contains(e.target)) {
        document.getElementById("todo-date-options")?.classList.remove("show");
    }
    if (editAgendaDp && !editAgendaDp.contains(e.target)) {
        document.getElementById("edit-agenda-date-options")?.classList.remove("show");
    }
    if (editTodoDp && !editTodoDp.contains(e.target)) {
        document.getElementById("edit-todo-date-options")?.classList.remove("show");
    }
    
    // Also close normal dropdowns if clicking outside
    if (!e.target.closest('.custom-dropdown-trigger') && !e.target.closest('.custom-dropdown-options')) {
        document.querySelectorAll('.custom-dropdown-options').forEach(el => el.classList.remove('show'));
    }
});


// ==========================================
// AUTHENTICATION VIEW CONTROL LOGIC
// ==========================================
window.switchAuthTab = function(view) {
    const tabLogin = document.getElementById("auth-tab-login");
    const tabSignup = document.getElementById("auth-tab-signup");
    const wrapLogin = document.getElementById("auth-login-wrapper");
    const wrapSignup = document.getElementById("auth-signup-wrapper");

    if (view === "login") {
        tabLogin?.classList.add("active");
        tabSignup?.classList.remove("active");
        if (wrapLogin) wrapLogin.style.display = "block";
        if (wrapSignup) wrapSignup.style.display = "none";
    } else {
        tabLogin?.classList.remove("active");
        tabSignup?.classList.add("active");
        if (wrapLogin) wrapLogin.style.display = "none";
        if (wrapSignup) wrapSignup.style.display = "block";
    }
};

window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        if (input.type === "password") {
            input.type = "text";
        } else {
            input.type = "password";
        }
    }
};

window.handleLoginSubmit = async function(event) {
    event.preventDefault();
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const errorMsg = document.getElementById("login-error");
    
    if (errorMsg) errorMsg.style.display = "none";
    
    try {
        await auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value);
    } catch (error) {
        if (errorMsg) {
            errorMsg.style.display = "block";
            errorMsg.textContent = "Email atau password salah. (" + error.message + ")";
        }
    }
};

window.handleSignupSubmit = async function(event) {
    event.preventDefault();
    const name = document.getElementById("signup-name")?.value.trim();
    const email = document.getElementById("signup-email")?.value.trim();
    const phoneCode = document.getElementById("signup-phone-code")?.value.trim() || "+62";
    const phone = document.getElementById("signup-phone")?.value.trim();
    const pass = document.getElementById("signup-password")?.value;
    const confirmPass = document.getElementById("signup-confirm")?.value;
    const agree = document.getElementById("signup-agree")?.checked;
    
    const errorMsg = document.getElementById("signup-error");
    if (errorMsg) errorMsg.style.display = "none";
    
    if (!agree) {
        if (errorMsg) {
            errorMsg.textContent = "Anda harus menyetujui Syarat & Ketentuan.";
            errorMsg.style.display = "block";
        }
        return;
    }
    
    if (pass.length < 8) {
        if (errorMsg) {
            errorMsg.textContent = "Password minimal harus 8 karakter.";
            errorMsg.style.display = "block";
        }
        return;
    }
    
    if (pass !== confirmPass) {
        if (errorMsg) {
            errorMsg.textContent = "Konfirmasi password tidak cocok!";
            errorMsg.style.display = "block";
        }
        return;
    }
    
    try {
        const userCred = await auth.createUserWithEmailAndPassword(email, pass);
        await userCred.user.updateProfile({ displayName: name });
        
        await db.collection('users').doc(email).set({
            profile: {
                name: name,
                email: email,
                phone: phoneCode + phone,
                role: 'Mahasiswa',
                dob: '',
                location: '',
                photo: ''
            }
        }, { merge: true });
        
        document.getElementById("form-signup")?.reset();
        
    } catch (error) {
        if (errorMsg) {
            errorMsg.textContent = error.message;
            errorMsg.style.display = "block";
        }
    }
};

window.handleGoogleAuth = async function(event) {
    event.preventDefault();
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (error) {
        alert("Gagal login dengan Google: " + error.message);
    }
};
window.handleForgotPassword = function(event) {
    event.preventDefault();
    const email = prompt("Masukkan email Anda untuk pemulihan password:");
    if (email) {
        alert("Link pemulihan password telah dikirim ke email: " + email);
    }
};

window.handleLogout = async function() {
    try {
        await auth.signOut();
        closeProfileModal();
        document.getElementById("form-login")?.reset();
        document.getElementById("form-signup")?.reset();
    } catch (error) {
        console.error("Logout error", error);
    }
};
window.autoDetectLocation = function() {
    const locInput = document.getElementById('edit-profile-location');
    const icon = document.getElementById('auto-location-icon');
    if (!locInput) return;
    
    if (!navigator.geolocation) {
        alert("Geolokasi tidak didukung oleh browser Anda.");
        return;
    }
    
    if (icon) icon.style.opacity = '0.5';
    const oldPlaceholder = locInput.placeholder;
    locInput.placeholder = "Mendeteksi lokasi...";
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            try {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
                const response = await fetch(url);
                const data = await response.json();
                
                if (data && data.address) {
                    const city = data.address.city || data.address.regency || data.address.county || data.address.state || "Indonesia";
                    locInput.value = city;
                } else {
                    alert("Gagal menemukan nama lokasi.");
                }
            } catch (err) {
                console.error("Geocoding error:", err);
            } finally {
                if (icon) icon.style.opacity = '1';
                locInput.placeholder = oldPlaceholder;
            }
        },
        (error) => {
            console.error("Geolocation error:", error);
            alert("Gagal mendapatkan izin atau akses lokasi. Cek pengaturan browser Anda.");
            if (icon) icon.style.opacity = '1';
            locInput.placeholder = oldPlaceholder;
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );
};

window.getRoleIconSvg = function(role) {
    switch(role) {
        case 'Mahasiswa': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>`;
        case 'Dosen / Guru': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`;
        case 'Pekerja': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`;
        case 'Wiraswasta': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
        case 'Ibu Rumah Tangga': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>`;
        case 'Pekerja lepas (Freelancer)': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
        case 'Content Creator': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
        case 'Lainnya': return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>`;
        default: return '';
    }
};

window.getUserAvatarColor = function(name) {
    const colors = [
        { bg: '#e0f2fe', text: '#0369a1' }, // Blue
        { bg: '#f3e8ff', text: '#7e22ce' }, // Purple
        { bg: '#fce7f3', text: '#be185d' }, // Pink
        { bg: '#ffedd5', text: '#c2410c' }, // Orange
        { bg: '#fef3c7', text: '#b45309' }, // Amber
        { bg: '#dcfce7', text: '#15803d' }, // Green
        { bg: '#e0e7ff', text: '#4338ca' }  // Indigo
    ];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
};

// ==========================================
// CONTEXT MENU, EDIT, AND DELETE LOGIC
// ==========================================

window.toggleContextMenu = function(e, menuId) {
    if (e && e.stopPropagation) {
        e.stopPropagation();
    } else {
        const ev = window.event;
        if (ev && ev.stopPropagation) ev.stopPropagation();
    }
    
    const menu = document.getElementById(menuId);
    if (!menu) return;
    
    const isShowing = menu.classList.contains('show');
    
    // Close all other menus first and restore overflow
    document.querySelectorAll('.context-menu-dropdown.show').forEach(m => {
        if (m.id !== menuId) {
            m.classList.remove('show');
            m.classList.remove('open-upwards');
            
            const parent = m.closest('.scrollable-stack') || 
                           m.closest('.custom-scrollbar') || 
                           m.closest('#date-detail-content');
            if (parent && parent.dataset.origOverflow) {
                parent.style.overflow = parent.dataset.origOverflow;
                delete parent.dataset.origOverflow;
            }
        }
    });
    
    if (!isShowing) {
        // Open the menu (display: flex)
        menu.classList.add('show');
        
        // Find scrollable parent and set overflow to visible to prevent clipping
        const parent = menu.closest('.scrollable-stack') || 
                       menu.closest('.custom-scrollbar') || 
                       menu.closest('#date-detail-content');
                       
        if (parent) {
            if (!parent.dataset.origOverflow) {
                parent.dataset.origOverflow = parent.style.overflow || window.getComputedStyle(parent).overflow;
            }
            parent.style.overflow = 'visible';
        }
        
        // Check positioning space
        const rect = menu.getBoundingClientRect();
        const parentRect = parent ? parent.getBoundingClientRect() : { bottom: window.innerHeight, top: 0 };
        
        // If it goes past the bottom boundary of the parent container
        if (rect.bottom > parentRect.bottom) {
            let btn = null;
            if (e && (e.currentTarget || e.target)) {
                const target = e.currentTarget || e.target;
                btn = target.closest('.context-menu-btn') || target;
            }
            if (!btn) {
                btn = menu.previousElementSibling;
            }
            
            const btnRect = btn.getBoundingClientRect();
            const spaceBelow = parentRect.bottom - btnRect.bottom;
            const spaceAbove = btnRect.top - parentRect.top;
            
            // Only flip upwards if there is actually more space above than below
            if (spaceAbove > spaceBelow) {
                menu.classList.add('open-upwards');
            }
        }
    } else {
        menu.classList.remove('show');
        menu.classList.remove('open-upwards');
        
        const parent = menu.closest('.scrollable-stack') || 
                       menu.closest('.custom-scrollbar') || 
                       menu.closest('#date-detail-content');
        if (parent && parent.dataset.origOverflow) {
            parent.style.overflow = parent.dataset.origOverflow;
            delete parent.dataset.origOverflow;
        }
    }
};

document.addEventListener('click', function() {
    document.querySelectorAll('.context-menu-dropdown.show').forEach(m => {
        m.classList.remove('show');
        m.classList.remove('open-upwards');
        
        const parent = m.closest('.scrollable-stack') || 
                       m.closest('.custom-scrollbar') || 
                       m.closest('#date-detail-content');
        if (parent && parent.dataset.origOverflow) {
            parent.style.overflow = parent.dataset.origOverflow;
            delete parent.dataset.origOverflow;
        }
    });
});

window.addEventListener('scroll', function() {
    document.querySelectorAll('.context-menu-dropdown.show').forEach(m => {
        m.classList.remove('show');
        m.classList.remove('open-upwards');
        
        const parent = m.closest('.scrollable-stack') || 
                       m.closest('.custom-scrollbar') || 
                       m.closest('#date-detail-content');
        if (parent && parent.dataset.origOverflow) {
            parent.style.overflow = parent.dataset.origOverflow;
            delete parent.dataset.origOverflow;
        }
    });
}, true);

window.openEditAgenda = function(id) {
    const agenda = state.schedules.find(s => s.id === id);
    if (!agenda) return;

    state.editingId = id;
    state.editingType = 'agenda';

    document.getElementById('input-edit-agenda-title').value = agenda.title;
    document.getElementById('input-edit-agenda-desc').value = agenda.description || '';
    
    document.getElementById('input-edit-agenda-date').value = agenda.date;
    const parts = agenda.date.split('-');
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    document.getElementById('selected-edit-agenda-date-text').textContent = `${parts[2]} ${months[parseInt(parts[1])-1]} ${parts[0]}`;
    
    document.getElementById('input-edit-agenda-start').value = agenda.startTime;
    document.getElementById('input-edit-agenda-end').value = agenda.endTime;
    document.getElementById('input-edit-agenda-location').value = agenda.location === '-' ? '' : agenda.location;
    
    document.getElementById('input-edit-agenda-category').value = agenda.category;
    document.getElementById('selected-edit-agenda-cat-text').textContent = capitalize(agenda.category);
    const catColors = { meeting: 'blue', deadline: 'red', review: 'yellow', personal: 'green' };
    const catDot = document.getElementById('selected-edit-agenda-cat-dot');
    if (catDot) catDot.className = `dot-indicator ${catColors[agenda.category] || 'blue'}`;
    
    document.getElementById('input-edit-agenda-reminder').value = agenda.reminder || 'none';
    const remTextMap = { 'none': 'Tidak Ada', '5m': '5 menit sebelum', '15m': '15 menit sebelum', '30m': '30 menit sebelum', '1h': '1 jam sebelum', '1d': '1 hari sebelum', 'custom': 'Kustom...' };
    // Try to map, if not found (custom strings), use the raw string
    let reminderText = remTextMap[agenda.reminder || 'none'];
    if (!reminderText) reminderText = agenda.reminder;
    document.getElementById('selected-edit-agenda-reminder-text').textContent = reminderText;

    document.getElementById('modal-edit-agenda').style.display = 'flex';
};

window.toggleTodoCompleteDetail = function(id) {
    const todo = state.todos.find(t => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    saveToStorage();
    if (typeof renderActiveView === 'function') renderActiveView();
    
    const btn = document.getElementById(`todo-check-${id}`);
    const titleText = document.getElementById(`todo-title-${id}`);
    if (btn) {
        if (todo.completed) {
            btn.style.background = 'var(--primary-teal)';
            btn.style.borderColor = 'var(--primary-teal)';
            const svg = btn.querySelector('svg');
            if (svg) {
                svg.style.opacity = '1';
                svg.style.transform = 'scale(1)';
            }
            if (titleText) {
                titleText.style.textDecoration = 'line-through';
                titleText.style.color = '#94a3b8';
            }
        } else {
            btn.style.background = 'transparent';
            btn.style.borderColor = '#cbd5e1';
            const svg = btn.querySelector('svg');
            if (svg) {
                svg.style.opacity = '0';
                svg.style.transform = 'scale(0.5)';
            }
            if (titleText) {
                titleText.style.textDecoration = 'none';
                titleText.style.color = 'var(--text-primary)';
            }
        }
    }
};

window.openEditTodo = function(id) {
    const todo = state.todos.find(t => t.id === id);
    if (!todo) return;

    state.editingId = id;
    state.editingType = 'todo';

    document.getElementById('input-edit-todo-title').value = todo.title;
    document.getElementById('input-edit-todo-desc').value = todo.description || '';
    
    document.getElementById('input-edit-todo-date').value = todo.date;
    const parts = todo.date.split('-');
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    document.getElementById('selected-edit-todo-date-text').textContent = `${parts[2]} ${months[parseInt(parts[1])-1]} ${parts[0]}`;
    
    document.getElementById('input-edit-todo-start').value = todo.startTime || '';
    
    const editPriorityRow = document.getElementById('edit-todo-priority-row');
    if (editPriorityRow) {
        const input = document.getElementById('input-edit-todo-priority');
        if (input) input.value = todo.priority || 'medium';
        const btns = editPriorityRow.querySelectorAll('.btn-priority-select');
        btns.forEach(btn => {
            if (btn.getAttribute('data-priority') === (todo.priority || 'medium')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    document.getElementById('input-edit-todo-reminder').value = todo.reminder || 'none';
    const remTextMap = { 'none': 'Tidak Ada', '5m': '5 menit sebelum', '15m': '15 menit sebelum', '30m': '30 menit sebelum', '1h': '1 jam sebelum', '1d': '1 hari sebelum', 'custom': 'Kustom...' };
    // Try to map, if not found (custom strings), use the raw string
    let reminderText = remTextMap[todo.reminder || 'none'];
    if (!reminderText) reminderText = todo.reminder;
    document.getElementById('selected-edit-todo-reminder-text').textContent = reminderText;

    document.getElementById('modal-edit-todo').style.display = 'flex';
};

window.selectCategory = function(val, text, prefix, colorClass) {
    document.getElementById(`input-${prefix}-category`).value = val;
    document.getElementById(`selected-${prefix}-cat-text`).textContent = text;
    const dot = document.getElementById(`selected-${prefix}-cat-dot`);
    if (dot && colorClass) {
        dot.className = `dot-indicator ${colorClass}`;
    }
    document.getElementById(`${prefix}-cat-options`)?.classList.remove('show');
};

window.selectReminder = function(val, text, prefix) {
    if (val === 'custom') {
        document.getElementById(`${prefix}-reminder-options`)?.classList.remove('show');
        state.customReminderTarget = prefix;
        document.getElementById('modal-custom-reminder').style.display = 'flex';
        return;
    }
    document.getElementById(`input-${prefix}-reminder`).value = val;
    document.getElementById(`selected-${prefix}-reminder-text`).textContent = text;
    document.getElementById(`${prefix}-reminder-options`)?.classList.remove('show');
};

window.selectPriority = function(val, text, prefix, colorClass) {
    document.getElementById(`input-${prefix}-priority`).value = val;
    document.getElementById(`selected-${prefix}-priority-text`).textContent = text;
    const dot = document.getElementById(`selected-${prefix}-priority-dot`);
    if (dot && colorClass) {
        dot.className = `dot-indicator ${colorClass}`;
    }
    document.getElementById(`${prefix}-priority-options`)?.classList.remove('show');
};

window.toggleDropdown = function(id, e) {
    e.stopPropagation();
    document.querySelectorAll('.custom-dropdown-options').forEach(el => {
        if (el.id !== id) el.classList.remove('show');
    });
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show');
};

document.addEventListener("DOMContentLoaded", () => {
    const editAgendaForm = document.getElementById('form-edit-agenda');
    if (editAgendaForm) {
        editAgendaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!state.editingId) return;
            const idx = state.schedules.findIndex(s => s.id === state.editingId);
            if (idx > -1) {
                const updatedEvent = {
                    ...state.schedules[idx],
                    title: document.getElementById('input-edit-agenda-title').value,
                    category: document.getElementById('input-edit-agenda-category').value,
                    date: document.getElementById('input-edit-agenda-date').value,
                    startTime: document.getElementById('input-edit-agenda-start').value,
                    endTime: document.getElementById('input-edit-agenda-end').value,
                    location: document.getElementById('input-edit-agenda-location').value || '-',
                    reminder: document.getElementById('input-edit-agenda-reminder').value,
                    description: document.getElementById('input-edit-agenda-desc').value
                };
                handleClashOrSave(updatedEvent, 'event', true);
            }
        });
    }

    const editTodoForm = document.getElementById('form-edit-todo');
    if (editTodoForm) {
        editTodoForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!state.editingId) return;
            const idx = state.todos.findIndex(t => t.id === state.editingId);
            if (idx > -1) {
                const updatedTodo = {
                    ...state.todos[idx],
                    title: document.getElementById('input-edit-todo-title').value,
                    priority: document.getElementById('input-edit-todo-priority').value,
                    date: document.getElementById('input-edit-todo-date').value,
                    startTime: document.getElementById('input-edit-todo-start').value,
                    endTime: document.getElementById('input-edit-todo-start').value, // To-Do only has 1 time input
                    reminder: document.getElementById('input-edit-todo-reminder').value,
                    description: document.getElementById('input-edit-todo-desc').value
                };
                handleClashOrSave(updatedTodo, 'todo', true);
            }
        });
    }
});

let deleteTargetId = null;
let deleteTargetType = null;

window.openDeleteConfirmModal = function(id, type) {
    deleteTargetId = id;
    deleteTargetType = type;
    
    let titleText = "Hapus data ini?";
    let descText = "Data akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.";
    
    if (type === 'agenda') {
        const item = state.schedules.find(s => s.id === id);
        if (item) {
            titleText = "Hapus jadwal ini?";
            descText = `Jadwal "${item.title}" pada ${formatDateIndo(item.date)} pukul ${item.startTime} - ${item.endTime} akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.`;
        }
    } else if (type === 'todo') {
        const item = state.todos.find(t => t.id === id);
        if (item) {
            titleText = "Hapus todo ini?";
            descText = `Todo "${item.title}" pada ${formatDateIndo(item.date)} akan dihapus secara permanen. Tindakan ini tidak dapat dibatalkan.`;
        }
    }
    
    const titleEl = document.getElementById('delete-modal-title');
    const descEl = document.getElementById('delete-modal-desc');
    
    if (titleEl) titleEl.textContent = titleText;
    if (descEl) descEl.textContent = descText;
    
    document.getElementById('modal-delete-confirm').style.display = 'flex';
};

window.confirmDelete = function() {
    if (!deleteTargetId || !deleteTargetType) return;
    
    if (deleteTargetType === 'agenda') {
        const item = state.schedules.find(s => s.id === deleteTargetId);
        state.schedules = state.schedules.filter(s => s.id !== deleteTargetId);
        showPushToast("Dihapus", `Jadwal "${item ? item.title : 'Agenda'}" telah dihapus.`);
    } else if (deleteTargetType === 'todo') {
        const item = state.todos.find(t => t.id === deleteTargetId);
        state.todos = state.todos.filter(t => t.id !== deleteTargetId);
        showPushToast("Dihapus", `Tugas "${item ? item.title : 'Todo'}" telah dihapus.`);
    }
    
    saveToStorage();
    window.closeEditModals();
    renderActiveView();
    if (document.getElementById('modal-date-detail').style.display === 'flex' && state.currentDetailDate) {
        window.openDateDetailModal(state.currentDetailDate);
    }
    
    deleteTargetId = null;
    deleteTargetType = null;
};

// ==========================================
// RIPPLE EFFECT
// ==========================================
document.addEventListener('mousedown', function(e) {
    const btn = e.target.closest('.btn-primary, .btn-secondary, .btn-create-agenda, .btn-arrow-nav, .btn-strip-nav, .filter-pill, .btn-card-bookmark, .btn-modal-outline, .btn-modal-solid');
    if (!btn) return;
    
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.className = 'ripple-effect';
    
    // Manage position relative if not set
    if (window.getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
    }
    btn.style.overflow = 'hidden'; // ensure ripple stays inside
    
    btn.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
});

// ==========================================
// DATE DETAIL MODAL LOGIC
// ==========================================
window.openDateDetailModal = function(dateStr, event) {
    console.log("openDateDetailModal called for date:", dateStr);
    if (event) {
        event.stopPropagation();
    }
    state.currentDetailDate = dateStr;
    
    const titleEl = document.getElementById('date-detail-title');
    if (titleEl) {
        titleEl.textContent = formatDateIndo(dateStr);
    }
    
    const dayAgendas = state.schedules.filter(s => s.date === dateStr);
    const dayTodos = state.todos.filter(t => t.date === dateStr);
    
    dayAgendas.sort((a, b) => {
        const timeA = a.startTime || "24:00";
        const timeB = b.startTime || "24:00";
        return timeA.localeCompare(timeB);
    });
    
    const prioOrder = { 'high': 1, 'medium': 2, 'low': 3 };
    dayTodos.sort((a, b) => (prioOrder[a.priority] || 3) - (prioOrder[b.priority] || 3));
    
    const agendaListEl = document.getElementById('date-detail-agenda-list');
    const todoListEl = document.getElementById('date-detail-todo-list');
    const agendaSection = document.getElementById('date-detail-agenda-section');
    const todoSection = document.getElementById('date-detail-todo-section');
    
    if (dayAgendas.length > 0) {
        agendaSection.style.display = 'block';
        let html = '';
        dayAgendas.forEach((ag, index) => {
            const catColors = {
                'personal': { border: 'var(--cat-personal)', bg: 'var(--cat-personal-light)' },
                'review': { border: 'var(--cat-review)', bg: 'var(--cat-review-light)' },
                'deadline': { border: 'var(--cat-deadline)', bg: 'var(--cat-deadline-light)' },
                'meeting': { border: 'var(--cat-meeting)', bg: 'var(--cat-meeting-light)' }
            };
            const colorObj = catColors[ag.category] || { border: 'var(--border-color)', bg: 'var(--bg-primary)' };
            
            html += `
                <div style="display: flex; background: #ffffff; border: 1px solid #f1f5f9; box-shadow: 0 4px 12px rgba(0,0,0,0.04); border-radius: 12px; padding: 16px; position: relative; gap: 12px; align-items: center; padding-right: 48px; z-index: ${100 - index};">
                    <div style="width: 4px; height: 32px; background-color: ${colorObj.border}; border-radius: 4px; flex-shrink: 0;"></div>
                    <div style="flex: 1; min-width: 0;">
                        <p style="font-size: 11px; color: #94a3b8; font-weight: 600; margin-bottom: 4px;">${ag.startTime} - ${ag.endTime}</p>
                        <h4 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ag.title}</h4>
                        <div style="display: flex; align-items: center; gap: 4px; color: #64748b; font-size: 11px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ag.location || 'Tidak ada lokasi'}</span>
                        </div>
                    </div>
                    
                    <div class="context-menu-container" style="top: 50%; transform: translateY(-50%); right: 16px;">
                        <button class="context-menu-btn" onclick="window.toggleContextMenu(event, 'ctx-agenda-detail-${ag.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                        </button>
                        <div class="context-menu-dropdown" id="ctx-agenda-detail-${ag.id}">
                            <button class="context-menu-item" onclick="window.openEditAgenda('${ag.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                Edit Jadwal
                            </button>
                            <button class="context-menu-item delete" onclick="window.openDeleteConfirmModal('${ag.id}', 'agenda')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                Hapus Jadwal
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        agendaListEl.innerHTML = html;
    } else {
        agendaSection.style.display = 'none';
        agendaListEl.innerHTML = '';
    }
    
    if (dayTodos.length > 0) {
        todoSection.style.display = 'block';
        let html = '';
        dayTodos.forEach((td, index) => {
            let prioHtml = '';
            if (td.priority === 'high') {
                prioHtml = `<span style="display: inline-flex; align-items: center; gap: 4px; color: var(--cat-deadline-text); border: 1px solid var(--cat-deadline); background-color: var(--cat-deadline-light); padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;"><span style="font-size: 14px;">⚑</span> Tinggi</span>`;
            } else if (td.priority === 'medium') {
                prioHtml = `<span style="display: inline-flex; align-items: center; gap: 4px; color: var(--cat-review-text); border: 1px solid var(--cat-review); background-color: var(--cat-review-light); padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;"><span style="font-size: 14px;">⚑</span> Sedang</span>`;
            } else {
                prioHtml = `<span style="display: inline-flex; align-items: center; gap: 4px; color: var(--cat-personal-text); border: 1px solid var(--cat-personal); background-color: var(--cat-personal-light); padding: 4px 12px; border-radius: 8px; font-size: 11px; font-weight: 600;"><span style="font-size: 14px;">↓</span> Rendah</span>`;
            }

            html += `
                <div style="display: flex; background: #ffffff; border: 1px solid #f1f5f9; box-shadow: 0 4px 12px rgba(0,0,0,0.04); border-radius: 12px; padding: 16px; align-items: center; gap: 16px; position: relative; padding-right: 48px; z-index: ${100 - index};">
                    <button id="todo-check-${td.id}" onclick="window.toggleTodoCompleteDetail('${td.id}')" style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${td.completed ? 'var(--primary-teal)' : '#cbd5e1'}; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: ${td.completed ? 'var(--primary-teal)' : 'transparent'}; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); padding: 0;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="opacity: ${td.completed ? 1 : 0}; transform: ${td.completed ? 'scale(1)' : 'scale(0.5)'}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </button>
                    <div style="flex: 1; min-width: 0;">
                        <h4 id="todo-title-${td.id}" style="font-size: 15px; font-weight: 700; color: ${td.completed ? '#94a3b8' : 'var(--text-primary)'}; text-decoration: ${td.completed ? 'line-through' : 'none'}; margin: 0 0 6px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: all 0.3s ease;">${td.title}</h4>
                        ${prioHtml}
                    </div>
                    
                    <div class="context-menu-container" style="top: 50%; transform: translateY(-50%); right: 16px;">
                        <button class="context-menu-btn" onclick="window.toggleContextMenu(event, 'ctx-todo-detail-${td.id}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                        </button>
                        <div class="context-menu-dropdown" id="ctx-todo-detail-${td.id}">
                            <button class="context-menu-item" onclick="window.openEditTodo('${td.id}')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                Edit Todo
                            </button>
                            <button class="context-menu-item delete" onclick="window.openDeleteConfirmModal('${td.id}', 'todo')">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                Hapus Todo
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        todoListEl.innerHTML = html;
    } else {
        todoSection.style.display = 'none';
        todoListEl.innerHTML = '';
    }

    if (dayAgendas.length === 0 && dayTodos.length === 0) {
        agendaSection.style.display = 'block';
        agendaListEl.innerHTML = '<p style="text-align:center; color: #64748b; font-size: 14px; padding: 20px 0;">Tidak ada aktivitas pada tanggal ini.</p>';
    }
    
    document.getElementById('modal-date-detail').style.display = 'flex';
};


