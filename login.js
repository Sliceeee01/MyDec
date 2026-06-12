// ============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================
let db, ref, set, get, push, query, orderByChild, equalTo, update, remove, onValue;

function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.firebaseDB) {
                db = window.firebaseDB;
                ref = window.firebaseRef;
                set = window.firebaseSet;
                get = window.firebaseGet;
                push = window.firebasePush;
                query = window.firebaseQuery;
                orderByChild = window.firebaseOrderByChild;
                equalTo = window.firebaseEqualTo;
                update = window.firebaseUpdate;
                remove = window.firebaseRemove;
                onValue = window.firebaseOnValue;
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });
}

// ============================================
// БАЗА ДАННЫХ
// ============================================
class Database {
    constructor() {
        this.initPromise = waitForFirebase();
    }

    async getUsers() {
        await this.initPromise;
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val();
        return users ? Object.values(users) : [];
    }

    async findUserByEmail(email) {
        await this.initPromise;
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val();
        if (!users) return null;
        
        for (let key in users) {
            if (users[key].email === email.toLowerCase()) {
                return { ...users[key], id: key };
            }
        }
        return null;
    }

    async findUserByUniqueId(uniqueId) {
        await this.initPromise;
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val();
        if (!users) return null;
        
        for (let key in users) {
            if (users[key].uniqueId === uniqueId) {
                return { ...users[key], id: key };
            }
        }
        return null;
    }

    async addUser(name, email, password) {
        await this.initPromise;
        const usersRef = ref(db, 'users');
        const newUserRef = push(usersRef);
        const uniqueId = 'ID' + Math.random().toString(36).substr(2, 8).toUpperCase();
        
        const userData = {
            name: name,
            email: email.toLowerCase(),
            password: password,
            uniqueId: uniqueId,
            friends: [],
            avatar: null,
            bio: '',
            cover: null,
            lastNameChange: 0,
            createdAt: new Date().toISOString()
        };
        
        await set(newUserRef, userData);
        return { ...userData, id: newUserRef.key };
    }

    async findUser(email, password) {
        await this.initPromise;
        const user = await this.findUserByEmail(email);
        if (user && user.password === password) {
            return user;
        }
        return null;
    }

    async updateUser(email, updates) {
        await this.initPromise;
        const user = await this.findUserByEmail(email);
        if (user) {
            for (let key in updates) {
                await set(ref(db, 'users/' + user.id + '/' + key), updates[key]);
            }
            return true;
        }
        return false;
    }
}

// ============================================
// ПРИЛОЖЕНИЕ ВХОДА
// ============================================
class LoginApp {
    constructor() {
        this.db = new Database();
        this.init();
    }

    async init() {
        await this.db.initPromise;
        this.cacheDOM();
        this.bindEvents();
        await this.checkIfLoggedIn();
        this.showUsersInConsole();
    }

    cacheDOM() {
        this.loginBtn = document.getElementById('loginBtn');
        this.modal = document.getElementById('loginModal');
        this.closeBtn = document.querySelector('.close-modal');
        this.loginForm = document.getElementById('loginForm');
        this.registerForm = document.getElementById('registerForm');
        this.forgotForm = document.getElementById('forgotForm');
        
        this.loginContainer = document.getElementById('loginFormContainer');
        this.registerContainer = document.getElementById('registerFormContainer');
        this.forgotContainer = document.getElementById('forgotFormContainer');
        
        this.loginEmail = document.getElementById('loginEmail');
        this.loginPassword = document.getElementById('loginPassword');
        this.remember = document.getElementById('remember');
        
        this.regName = document.getElementById('regName');
        this.regEmail = document.getElementById('regEmail');
        this.regPassword = document.getElementById('regPassword');
        this.regConfirm = document.getElementById('regConfirmPassword');
        
        this.forgotEmail = document.getElementById('forgotEmail');
    }

    bindEvents() {
        this.loginBtn.addEventListener('click', () => this.openModal());
        this.closeBtn.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', e => { if (e.target === this.modal) this.closeModal(); });
        
        this.loginForm.addEventListener('submit', e => this.login(e));
        this.registerForm.addEventListener('submit', e => this.register(e));
        this.forgotForm.addEventListener('submit', e => this.forgotPassword(e));
        
        document.getElementById('showRegister').addEventListener('click', e => { e.preventDefault(); this.showForm('register'); });
        document.getElementById('showForgot').addEventListener('click', e => { e.preventDefault(); this.showForm('forgot'); });
        document.getElementById('showLoginFromReg').addEventListener('click', e => { e.preventDefault(); this.showForm('login'); });
        document.getElementById('showLoginFromForgot').addEventListener('click', e => { e.preventDefault(); this.showForm('login'); });
        
        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', function() {
                const input = document.getElementById(this.dataset.target);
                input.type = input.type === 'password' ? 'text' : 'password';
                this.textContent = input.type === 'password' ? '👁' : '🔒';
            });
        });
    }

    showForm(type) {
        this.loginContainer.style.display = type === 'login' ? 'block' : 'none';
        this.registerContainer.style.display = type === 'register' ? 'block' : 'none';
        this.forgotContainer.style.display = type === 'forgot' ? 'block' : 'none';
    }

    openModal() {
        this.showForm('login');
        this.modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        setTimeout(() => this.loginEmail.focus(), 100);
    }

    closeModal() {
        this.modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }

    async login(e) {
        e.preventDefault();
        const email = this.loginEmail.value.trim();
        const password = this.loginPassword.value;
        
        if (!email || !password) {
            alert('Заполните все поля');
            return;
        }
        
        const user = await this.db.findUser(email, password);
        
        if (user) {
            const userData = {
                email: user.email,
                name: user.name,
                uniqueId: user.uniqueId,
                avatar: user.avatar,
                bio: user.bio
            };
            
            if (this.remember.checked) {
                localStorage.setItem('currentUser', JSON.stringify(userData));
                sessionStorage.removeItem('currentUser');
            } else {
                sessionStorage.setItem('currentUser', JSON.stringify(userData));
                localStorage.removeItem('currentUser');
            }
            
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 100);
        } else {
            alert('Неверный email или пароль');
        }
    }

    async register(e) {
        e.preventDefault();
        const name = this.regName.value.trim();
        const email = this.regEmail.value.trim();
        const password = this.regPassword.value;
        const confirm = this.regConfirm.value;
        
        if (!name || !email || !password) {
            alert('Заполните все поля');
            return;
        }
        
        if (password !== confirm) {
            alert('Пароли не совпадают');
            return;
        }
        
        if (password.length < 6) {
            alert('Пароль минимум 6 символов');
            return;
        }
        
        const existingUser = await this.db.findUserByEmail(email);
        if (existingUser) {
            alert('Email уже используется');
            return;
        }
        
        const newUser = await this.db.addUser(name, email, password);
        alert(`Регистрация успешна!\nВаш ID: ${newUser.uniqueId}\nСохраните его!`);
        
        this.showForm('login');
        this.loginEmail.value = email;
    }

    async forgotPassword(e) {
        e.preventDefault();
        const email = this.forgotEmail.value.trim();
        
        if (!email) {
            alert('Введите email');
            return;
        }
        
        const user = await this.db.findUserByEmail(email);
        
        if (!user) {
            alert('Пользователь не найден');
            return;
        }
        
        const newPassword = Math.random().toString(36).substr(2, 8);
        await this.db.updateUser(email, { password: newPassword });
        
        alert(`Новый пароль: ${newPassword}\nЗапишите его!`);
        console.log(`Новый пароль для ${email}: ${newPassword}`);
        
        this.showForm('login');
        this.loginEmail.value = email;
    }

    async checkIfLoggedIn() {
        const currentUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        
        if (currentUser) {
            try {
                const userData = JSON.parse(currentUser);
                const userExists = await this.db.findUserByEmail(userData.email);
                if (userExists) {
                    window.location.href = 'home.html';
                }
            } catch(e) {}
        }
    }

    async showUsersInConsole() {
        const users = await this.db.getUsers();
        console.log('=== ПОЛЬЗОВАТЕЛИ ===');
        console.table(users.map(u => ({
            Имя: u.name,
            Email: u.email,
            ID: u.uniqueId
        })));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new LoginApp();
});