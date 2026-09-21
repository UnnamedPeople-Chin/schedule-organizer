const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// 1. Inject Firebase Config at the top
const firebaseInit = `
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

`;
if (!code.includes('FIREBASE INITIALIZATION')) {
    code = code.replace('let state = {', firebaseInit + 'let state = {');
}

// 2. Replace saveToStorage
code = code.replace(/function saveToStorage\(\) \{[\s\S]*?\n\}/, `function saveToStorage() {
    if (!auth.currentUser) return;
    db.collection('users').doc(auth.currentUser.email).set({
        schedules: state.schedules,
        todos: state.todos,
        selectedMonth: state.selectedMonth,
        selectedYear: state.selectedYear,
        categories: state.categories
    }, { merge: true }).catch(err => console.error("Error saving data:", err));
}`);

// 3. Replace loadFromStorage
code = code.replace(/function loadFromStorage\(\) \{[\s\S]*?(?=\nfunction loadDefaults)/, `async function loadFromStorage(user) {
    if (!user) return;
    try {
        const doc = await db.collection('users').doc(user.email).get();
        if (doc.exists) {
            const data = doc.data();
            state.schedules = data.schedules || [];
            state.todos = data.todos || [];
            state.selectedMonth = new Date().getMonth();
            state.selectedYear = new Date().getFullYear();
            state.categories = data.categories || [];
            
            if (data.profile) {
                currentUserProfile = data.profile;
            } else {
                currentUserProfile = { name: user.displayName || user.email.split('@')[0], email: user.email, role: 'Mahasiswa' };
            }
            
            // Migration check
            if (!state.schedules.some(s => s.id && s.id.startsWith('dsched-'))) {
                loadDefaults();
            } else {
                renderActiveView();
                loadProfileData();
            }
        } else {
            currentUserProfile = { name: user.displayName || user.email.split('@')[0], email: user.email, role: 'Mahasiswa' };
            loadDefaults();
            loadProfileData();
        }
    } catch (e) {
        console.error("Error loading data:", e);
        loadDefaults();
    }
}`);

// 4. Update loadDefaults
code = code.replace(/function loadDefaults\(\) \{[\s\S]*?\n\}/, `function loadDefaults() {
    const dynamicData = generateDynamicDummyData();
    state.schedules = dynamicData.schedules;
    state.todos = dynamicData.todos;
    saveToStorage();
    renderActiveView();
}`);

// 5. Replace DOMContentLoaded listener for initialization
code = code.replace(/document\.addEventListener\('DOMContentLoaded', \(\) => \{[\s\S]*?\}\);/m, `document.addEventListener('DOMContentLoaded', () => {
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
        }
    });
});`);

// 6. Replace handleLoginSubmit
code = code.replace(/window\.handleLoginSubmit = function\(event\) \{[\s\S]*?(?=\nwindow\.handleRegisterSubmit)/, `window.handleLoginSubmit = async function(event) {
    event.preventDefault();
    const emailInput = document.getElementById("login-email");
    const passwordInput = document.getElementById("login-password");
    const errorMsg = document.getElementById("login-error");
    
    try {
        errorMsg.style.display = "none";
        await auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value);
    } catch (error) {
        errorMsg.style.display = "block";
        errorMsg.textContent = "Email atau password salah.";
    }
};`);

// 7. Replace handleRegisterSubmit
code = code.replace(/window\.handleRegisterSubmit = function\(event\) \{[\s\S]*?(?=\nwindow\.handleGoogleAuth)/, `window.handleRegisterSubmit = async function(event) {
    event.preventDefault();
    const nameInput = document.getElementById("signup-name").value;
    const emailInput = document.getElementById("signup-email").value;
    const roleInput = document.getElementById("signup-role").value;
    const passwordInput = document.getElementById("signup-password").value;
    const confirmInput = document.getElementById("signup-confirm").value;
    const errorMsg = document.getElementById("signup-error");
    
    if (passwordInput !== confirmInput) {
        errorMsg.style.display = "block";
        errorMsg.textContent = "Konfirmasi password tidak cocok.";
        return;
    }
    
    try {
        errorMsg.style.display = "none";
        const userCred = await auth.createUserWithEmailAndPassword(emailInput, passwordInput);
        await userCred.user.updateProfile({ displayName: nameInput });
        
        // Save initial profile
        await db.collection('users').doc(emailInput).set({
            profile: { name: nameInput, email: emailInput, role: roleInput, photo: '', dob: '', phone: '', location: '' }
        }, { merge: true });
        
    } catch (error) {
        errorMsg.style.display = "block";
        errorMsg.textContent = error.message;
    }
};`);

// 8. Replace handleGoogleAuth
code = code.replace(/window\.handleGoogleAuth = function\(event\) \{[\s\S]*?(?=\nwindow\.handleForgotPassword)/, `window.handleGoogleAuth = async function(event) {
    event.preventDefault();
    try {
        await auth.signInWithPopup(googleProvider);
    } catch (error) {
        alert("Gagal login dengan Google: " + error.message);
    }
};`);

// 9. Replace handleLogout
code = code.replace(/window\.handleLogout = function\(\) \{[\s\S]*?(?=\nwindow\.autoDetectLocation)/, `window.handleLogout = async function() {
    try {
        await auth.signOut();
        closeProfileModal();
        document.getElementById("form-login")?.reset();
        document.getElementById("form-signup")?.reset();
    } catch (error) {
        console.error("Logout error", error);
    }
};`);

// 10. Replace loadProfileData
code = code.replace(/function loadProfileData\(\) \{[\s\S]*?(?=\nfunction updateProfileDOM)/, `function loadProfileData() {
    if (currentUserProfile) {
        updateProfileDOM(currentUserProfile);
        checkProfileCompleteness(currentUserProfile);
    }
}`);

// 11. Replace handleSaveProfile
code = code.replace(/window\.handleSaveProfile = function\(event\) \{[\s\S]*?(?=\ndocument\.addEventListener\('click')/, `window.handleSaveProfile = async function(event) {
    event.preventDefault();
    if (!auth.currentUser || !currentUserProfile) return;
    
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
    
    try {
        await db.collection('users').doc(auth.currentUser.email).set({ profile: currentUserProfile }, { merge: true });
        
        closeEditProfileModal();
        loadProfileData();
        if (window.showPushToast) {
            showPushToast("Profil Diperbarui", "Data profil Anda berhasil disimpan ke Cloud.");
        } else {
            alert("Profil berhasil diperbarui.");
        }
    } catch (err) {
        alert("Gagal menyimpan profil: " + err.message);
    }
};`);

fs.writeFileSync('app.js', code);
console.log("Refactoring complete!");
