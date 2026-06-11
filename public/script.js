// ============================================
// БАЗА ДАННЫХ
// ============================================
class Database {
    constructor() {
        this.storageKey = 'mydesktop_users_v3';
    }

    getUsers() {
        const data = localStorage.getItem(this.storageKey);
        if (data) return JSON.parse(data);
        
        // Создаем начальных пользователей с уникальными ID
        const initialUsers = [
            this.createUserObject('Администратор', 'admin@mail.ru', 'admin123'),
            this.createUserObject('Пользователь', 'user@mail.ru', 'user123'),
            this.createUserObject('Тестовый', 'test@mail.ru', 'test123')
        ];
        
        this.saveUsers(initialUsers);
        return initialUsers;
    }

    createUserObject(name, email, password) {
        return {
            id: Date.now() + Math.random(),
            name: name,
            email: email.toLowerCase(),
            password: password,
            uniqueId: 'ID' + Math.random().toString(36).substr(2, 8).toUpperCase(),
            friends: [],
            createdAt: new Date().toISOString()
        };
    }

    saveUsers(users) {
        localStorage.setItem(this.storageKey, JSON.stringify(users));
    }

    addUser(name, email, password) {
        const users = this.getUsers();
        const newUser = this.createUserObject(name, email, password);
        users.push(newUser);
        this.saveUsers(users);
        return newUser;
    }

    findUserByEmail(email) {
        return this.getUsers().find(u => u.email === email.toLowerCase());
    }

    findUserByUniqueId(uniqueId) {
        return this.getUsers().find(u => u.uniqueId === uniqueId);
    }

    findUser(email, password) {
        return this.getUsers().find(u => u.email === email.toLowerCase() && u.password === password);
    }

    addFriend(userEmail, friendId) {
        const users = this.getUsers();
        const user = users.find(u => u.email === userEmail.toLowerCase());
        const friend = users.find(u => u.uniqueId === friendId);
        
        if (!user || !friend || user.email === friend.email) return false;
        
        if (!user.friends) user.friends = [];
        if (!friend.friends) friend.friends = [];
        
        if (!user.friends.includes(friendId)) user.friends.push(friendId);
        if (!friend.friends.includes(user.uniqueId)) friend.friends.push(user.uniqueId);
        
        this.saveUsers(users);
        return true;
    }

    removeFriend(userEmail, friendId) {
        const users = this.getUsers();
        const user = users.find(u => u.email === userEmail.toLowerCase());
        const friend = users.find(u => u.uniqueId === friendId);
        
        if (!user || !friend) return false;
        
        user.friends = user.friends.filter(id => id !== friendId);
        friend.friends = friend.friends.filter(id => id !== user.uniqueId);
        
        this.saveUsers(users);
        return true;
    }

    getFriends(userEmail) {
        const user = this.findUserByEmail(userEmail);
        if (!user || !user.friends) return [];
        
        const users = this.getUsers();
        return user.friends.map(fid => {
            const friend = users.find(u => u.uniqueId === fid);
            return friend ? { uniqueId: friend.uniqueId, name: friend.name, email: friend.email } : null;
        }).filter(Boolean);
    }
}

// ============================================
// МЕНЕДЖЕР СООБЩЕНИЙ
// ============================================
class MessageManager {
    constructor() {
        this.storageKey = 'mydesktop_messages_v3';
    }

    getMessages() {
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : {};
    }

    saveMessages(messages) {
        localStorage.setItem(this.storageKey, JSON.stringify(messages));
    }

    getChatId(id1, id2) {
        return [id1, id2].sort().join('___');
    }

    send(fromId, toId, text) {
        const messages = this.getMessages();
        const chatId = this.getChatId(fromId, toId);
        
        if (!messages[chatId]) messages[chatId] = [];
        
        messages[chatId].push({
            id: Date.now(),
            from: fromId,
            to: toId,
            text: text,
            time: new Date().toISOString(),
            read: false
        });
        
        this.saveMessages(messages);
    }

    getConversation(id1, id2) {
        const messages = this.getMessages();
        return messages[this.getChatId(id1, id2)] || [];
    }

    getUnreadCount(userId) {
        const messages = this.getMessages();
        let count = 0;
        Object.values(messages).forEach(chat => {
            chat.forEach(msg => {
                if (msg.to === userId && !msg.read) count++;
            });
        });
        return count;
    }

    markAsRead(fromId, toId) {
        const messages = this.getMessages();
        const chatId = this.getChatId(fromId, toId);
        
        if (messages[chatId]) {
            messages[chatId].forEach(msg => {
                if (msg.to === toId) msg.read = true;
            });
            this.saveMessages(messages);
        }
    }

    deleteChat(id1, id2) {
        const messages = this.getMessages();
        delete messages[this.getChatId(id1, id2)];
        this.saveMessages(messages);
    }

    getLastMessage(id1, id2) {
        const conv = this.getConversation(id1, id2);
        return conv[conv.length - 1];
    }
}

// ============================================
// ПРИЛОЖЕНИЕ ВХОДА
// ============================================
class LoginApp {
    constructor() {
        this.db = new Database();
        this.isRedirecting = false; // Флаг для предотвращения повторного редиректа
        this.init();
    }

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.checkIfLoggedIn();
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

    login(e) {
        e.preventDefault();
        
        const email = this.loginEmail.value.trim();
        const password = this.loginPassword.value;
        
        if (!email || !password) {
            alert('Заполните все поля');
            return;
        }
        
        const user = this.db.findUser(email, password);
        
        if (user) {
            const userData = {
                email: user.email,
                name: user.name,
                uniqueId: user.uniqueId
            };
            
            // Сначала сохраняем пользователя
            if (this.remember.checked) {
                localStorage.setItem('currentUser', JSON.stringify(userData));
                // Удаляем возможный конфликтующий sessionStorage
                sessionStorage.removeItem('currentUser');
            } else {
                sessionStorage.setItem('currentUser', JSON.stringify(userData));
                // Удаляем возможный конфликтующий localStorage
                localStorage.removeItem('currentUser');
            }
            
            // Небольшая задержка перед редиректом, чтобы гарантировать сохранение
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 100);
        } else {
            alert('Неверный email или пароль');
        }
    }

    register(e) {
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
        
        if (this.db.findUserByEmail(email)) {
            alert('Email уже используется');
            return;
        }
        
        const newUser = this.db.addUser(name, email, password);
        alert(`Регистрация успешна!\nВаш ID: ${newUser.uniqueId}\nСохраните его!`);
        
        this.showForm('login');
        this.loginEmail.value = email;
    }

    forgotPassword(e) {
        e.preventDefault();
        const email = this.forgotEmail.value.trim();
        
        if (!email) {
            alert('Введите email');
            return;
        }
        
        const user = this.db.findUserByEmail(email);
        
        if (!user) {
            alert('Пользователь не найден');
            return;
        }
        
        const newPassword = Math.random().toString(36).substr(2, 8);
        user.password = newPassword;
        
        const users = this.db.getUsers();
        const index = users.findIndex(u => u.email === email);
        users[index] = user;
        this.db.saveUsers(users);
        
        alert(`Новый пароль: ${newPassword}\nЗапишите его!`);
        console.log(`Новый пароль для ${email}: ${newPassword}`);
        
        this.showForm('login');
        this.loginEmail.value = email;
    }

    checkIfLoggedIn() {
        // Проверяем, есть ли пользователь в хранилище
        const currentUser = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        
        // Если есть пользователь и мы еще не перенаправляем
        if (currentUser && !this.isRedirecting) {
            this.isRedirecting = true;
            
            // Проверяем, что пользователь действительно существует в БД
            try {
                const userData = JSON.parse(currentUser);
                const userExists = this.db.findUserByEmail(userData.email);
                
                if (userExists) {
                    // Небольшая задержка для предотвращения конфликтов
                    setTimeout(() => {
                        window.location.replace('home.html');
                    }, 50);
                } else {
                    // Пользователь не существует в БД - очищаем хранилище
                    localStorage.removeItem('currentUser');
                    sessionStorage.removeItem('currentUser');
                    this.isRedirecting = false;
                }
            } catch (error) {
                console.error('Ошибка при проверке пользователя:', error);
                localStorage.removeItem('currentUser');
                sessionStorage.removeItem('currentUser');
                this.isRedirecting = false;
            }
        }
    }

    showUsersInConsole() {
        const users = this.db.getUsers();
        console.log('=== ПОЛЬЗОВАТЕЛИ ===');
        console.table(users.map(u => ({
            Имя: u.name,
            Email: u.email,
            ID: u.uniqueId,
            Пароль: u.password
        })));
    }
}

// Очищаем все потенциально проблемные данные при загрузке страницы
(function cleanup() {
    // Удаляем старые версии пользователей, если есть конфликты
    const currentUserLocal = localStorage.getItem('currentUser');
    const currentUserSession = sessionStorage.getItem('currentUser');
    
    if (currentUserLocal && currentUserSession) {
        // Если есть оба, оставляем только один (приоритет у localStorage)
        sessionStorage.removeItem('currentUser');
        console.log('Очищен конфликт sessionStorage');
    }
})();

// Запускаем приложение после полной загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    new LoginApp();
});