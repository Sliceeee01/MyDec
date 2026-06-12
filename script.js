// ============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================
let db, ref, set, get, push, query, orderByChild, equalTo, update, remove, onValue;

// Ждем загрузки Firebase
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
// БАЗА ДАННЫХ FIRESTORE
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

    async saveUsers(users) {
        await this.initPromise;
        // Не используем, Firebase работает по-другому
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

    async addFriend(userEmail, friendId) {
        await this.initPromise;
        const user = await this.findUserByEmail(userEmail);
        const friend = await this.findUserByUniqueId(friendId);
        
        if (!user || !friend || user.email === friend.email) return false;
        
        if (!user.friends) user.friends = [];
        if (!friend.friends) friend.friends = [];
        
        if (!user.friends.includes(friendId)) {
            user.friends.push(friendId);
            await set(ref(db, 'users/' + user.id + '/friends'), user.friends);
        }
        
        if (!friend.friends.includes(user.uniqueId)) {
            friend.friends.push(user.uniqueId);
            await set(ref(db, 'users/' + friend.id + '/friends'), friend.friends);
        }
        
        return true;
    }

    async removeFriend(userEmail, friendId) {
        await this.initPromise;
        const user = await this.findUserByEmail(userEmail);
        const friend = await this.findUserByUniqueId(friendId);
        
        if (!user || !friend) return false;
        
        if (user.friends) {
            user.friends = user.friends.filter(id => id !== friendId);
            await set(ref(db, 'users/' + user.id + '/friends'), user.friends);
        }
        
        if (friend.friends) {
            friend.friends = friend.friends.filter(id => id !== user.uniqueId);
            await set(ref(db, 'users/' + friend.id + '/friends'), friend.friends);
        }
        
        return true;
    }

    async getFriends(userEmail) {
        await this.initPromise;
        const user = await this.findUserByEmail(userEmail);
        if (!user || !user.friends || user.friends.length === 0) return [];
        
        const friends = [];
        for (let friendId of user.friends) {
            const friend = await this.findUserByUniqueId(friendId);
            if (friend) {
                friends.push({
                    uniqueId: friend.uniqueId,
                    name: friend.name,
                    email: friend.email,
                    avatar: friend.avatar,
                    bio: friend.bio
                });
            }
        }
        return friends;
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
// МЕНЕДЖЕР СООБЩЕНИЙ
// ============================================
class MessageManager {
    constructor() {
        this.initPromise = waitForFirebase();
        this.currentListener = null;
    }

    async getMessages() {
        await this.initPromise;
        const messagesRef = ref(db, 'messages');
        const snapshot = await get(messagesRef);
        return snapshot.val() || {};
    }

    async getChatId(id1, id2) {
        return [id1, id2].sort().join('___');
    }

    async send(fromId, toId, text, image = null) {
        await this.initPromise;
        const chatId = await this.getChatId(fromId, toId);
        const messagesRef = ref(db, 'messages/' + chatId);
        const newMessageRef = push(messagesRef);
        
        const messageData = {
            id: Date.now(),
            from: fromId,
            to: toId,
            text: text,
            image: image,
            pinned: false,
            time: new Date().toISOString(),
            read: false
        };
        
        await set(newMessageRef, messageData);
    }

    async deleteMessage(chatId, messageId) {
        await this.initPromise;
        const messagesRef = ref(db, 'messages/' + chatId);
        const snapshot = await get(messagesRef);
        const messages = snapshot.val();
        
        if (messages) {
            for (let key in messages) {
                if (messages[key].id === messageId) {
                    await remove(ref(db, 'messages/' + chatId + '/' + key));
                    return true;
                }
            }
        }
        return false;
    }

    async pinMessage(chatId, messageId) {
        await this.initPromise;
        const messagesRef = ref(db, 'messages/' + chatId);
        const snapshot = await get(messagesRef);
        const messages = snapshot.val();
        
        if (messages) {
            // Снимаем закрепление со всех
            for (let key in messages) {
                if (messages[key].pinned) {
                    await set(ref(db, 'messages/' + chatId + '/' + key + '/pinned'), false);
                }
            }
            // Закрепляем выбранное
            for (let key in messages) {
                if (messages[key].id === messageId) {
                    await set(ref(db, 'messages/' + chatId + '/' + key + '/pinned'), true);
                    return true;
                }
            }
        }
        return false;
    }

    async unpinMessage(chatId, messageId) {
        await this.initPromise;
        const messagesRef = ref(db, 'messages/' + chatId);
        const snapshot = await get(messagesRef);
        const messages = snapshot.val();
        
        if (messages) {
            for (let key in messages) {
                if (messages[key].id === messageId) {
                    await set(ref(db, 'messages/' + chatId + '/' + key + '/pinned'), false);
                    return true;
                }
            }
        }
        return false;
    }

    async getPinnedMessage(chatId) {
        await this.initPromise;
        const messagesRef = ref(db, 'messages/' + chatId);
        const snapshot = await get(messagesRef);
        const messages = snapshot.val();
        
        if (messages) {
            for (let key in messages) {
                if (messages[key].pinned) {
                    return messages[key];
                }
            }
        }
        return null;
    }

    async getConversation(id1, id2) {
        await this.initPromise;
        const chatId = await this.getChatId(id1, id2);
        const messagesRef = ref(db, 'messages/' + chatId);
        const snapshot = await get(messagesRef);
        const messages = snapshot.val();
        
        if (!messages) return [];
        return Object.values(messages).sort((a, b) => a.id - b.id);
    }

    async getUnreadCount(userId) {
        await this.initPromise;
        const messagesRef = ref(db, 'messages');
        const snapshot = await get(messagesRef);
        const allMessages = snapshot.val();
        let count = 0;
        
        if (allMessages) {
            for (let chatId in allMessages) {
                for (let key in allMessages[chatId]) {
                    const msg = allMessages[chatId][key];
                    if (msg.to === userId && !msg.read) count++;
                }
            }
        }
        return count;
    }

    async markAsRead(fromId, toId) {
        await this.initPromise;
        const chatId = await this.getChatId(fromId, toId);
        const messagesRef = ref(db, 'messages/' + chatId);
        const snapshot = await get(messagesRef);
        const messages = snapshot.val();
        
        if (messages) {
            for (let key in messages) {
                if (messages[key].to === toId && !messages[key].read) {
                    await set(ref(db, 'messages/' + chatId + '/' + key + '/read'), true);
                }
            }
        }
    }

    async deleteChat(id1, id2) {
        await this.initPromise;
        const chatId = await this.getChatId(id1, id2);
        await remove(ref(db, 'messages/' + chatId));
    }

    async getLastMessage(id1, id2) {
        const conv = await this.getConversation(id1, id2);
        return conv[conv.length - 1];
    }

    subscribeToMessages(id1, id2, callback) {
        this.initPromise.then(async () => {
            const chatId = await this.getChatId(id1, id2);
            const messagesRef = ref(db, 'messages/' + chatId);
            
            if (this.currentListener) {
                this.currentListener();
            }
            
            const unsubscribe = onValue(messagesRef, async (snapshot) => {
                const messages = snapshot.val();
                if (messages) {
                    const messagesArray = Object.values(messages).sort((a, b) => a.id - b.id);
                    callback(messagesArray);
                } else {
                    callback([]);
                }
            });
            
            this.currentListener = unsubscribe;
        });
    }

    unsubscribe() {
        if (this.currentListener) {
            this.currentListener();
            this.currentListener = null;
        }
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

// ============================================
// ЗАПУСК
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    new LoginApp();
});