// ============================================
// КЛАССЫ ДЛЯ РАБОТЫ С ДАННЫМИ
// ============================================
class Database {
    constructor() {
        this.storageKey = 'mydesktop_users_v3';
    }

    getUsers() {
        const data = localStorage.getItem(this.storageKey);
        return data ? JSON.parse(data) : [];
    }

    saveUsers(users) {
        localStorage.setItem(this.storageKey, JSON.stringify(users));
    }

    findUserByEmail(email) {
        return this.getUsers().find(u => u.email === email.toLowerCase());
    }

    findUserByUniqueId(uniqueId) {
        return this.getUsers().find(u => u.uniqueId === uniqueId);
    }

    updateUser(email, updates) {
        const users = this.getUsers();
        const index = users.findIndex(u => u.email === email.toLowerCase());
        if (index !== -1) {
            users[index] = { ...users[index], ...updates };
            this.saveUsers(users);
            return true;
        }
        return false;
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
        
        user.friends = (user.friends || []).filter(id => id !== friendId);
        friend.friends = (friend.friends || []).filter(id => id !== user.uniqueId);
        
        this.saveUsers(users);
        return true;
    }

    getFriends(userEmail) {
        const user = this.findUserByEmail(userEmail);
        if (!user || !user.friends || user.friends.length === 0) return [];
        
        const users = this.getUsers();
        return user.friends.map(fid => {
            const friend = users.find(u => u.uniqueId === fid);
            return friend ? { 
                uniqueId: friend.uniqueId, 
                name: friend.name, 
                email: friend.email, 
                avatar: friend.avatar,
                bio: friend.bio 
            } : null;
        }).filter(Boolean);
    }
}

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

    send(fromId, toId, text, image = null) {
        const messages = this.getMessages();
        const chatId = this.getChatId(fromId, toId);
        
        if (!messages[chatId]) messages[chatId] = [];
        
        messages[chatId].push({
            id: Date.now(),
            from: fromId,
            to: toId,
            text: text,
            image: image,
            pinned: false,
            time: new Date().toISOString(),
            read: false
        });
        
        this.saveMessages(messages);
    }

    deleteMessage(chatId, messageId) {
        const messages = this.getMessages();
        if (messages[chatId]) {
            messages[chatId] = messages[chatId].filter(m => m.id !== messageId);
            this.saveMessages(messages);
            return true;
        }
        return false;
    }

    pinMessage(chatId, messageId) {
        const messages = this.getMessages();
        if (messages[chatId]) {
            const message = messages[chatId].find(m => m.id === messageId);
            if (message) {
                messages[chatId].forEach(m => m.pinned = false);
                message.pinned = true;
                this.saveMessages(messages);
                return true;
            }
        }
        return false;
    }

    unpinMessage(chatId, messageId) {
        const messages = this.getMessages();
        if (messages[chatId]) {
            const message = messages[chatId].find(m => m.id === messageId);
            if (message) {
                message.pinned = false;
                this.saveMessages(messages);
                return true;
            }
        }
        return false;
    }

    getPinnedMessage(chatId) {
        const messages = this.getMessages();
        if (messages[chatId]) {
            return messages[chatId].find(m => m.pinned === true);
        }
        return null;
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
// ГЛАВНОЕ ПРИЛОЖЕНИЕ
// ============================================
class HomeApp {
    constructor() {
        this.currentUser = null;
        this.selectedChat = null;
        this.selectedMessageId = null;
        this.db = new Database();
        this.msg = new MessageManager();
        this.updateTimeout = null;
        this.isUpdating = false;
        
        if (!this.checkAuth()) return;
        this.init();
    }

    checkAuth() {
        const saved = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        
        console.log('checkAuth - saved:', saved);
        
        if (!saved) {
            console.log('Нет сохраненного пользователя');
            window.location.replace('index.html');
            return false;
        }
        
        try {
            this.currentUser = JSON.parse(saved);
            console.log('Пользователь загружен:', this.currentUser);
            
            // ВАЖНО: НЕ проверяем в БД здесь, чтобы не было асинхронной задержки
            // Просто возвращаем true, пользователь уже авторизован в localStorage
            
            return true;
        } catch (error) {
            console.error('Ошибка проверки пользователя:', error);
            localStorage.removeItem('currentUser');
            sessionStorage.removeItem('currentUser');
            window.location.replace('index.html');
            return false;
        }
    }

    init() {
        this.cacheAllDOM();
        this.bindAllEvents();
        this.updateUI();
        this.startPolling();
        this.initContextMenu();
        console.log('HomeApp инициализирован. Ваш ID:', this.currentUser.uniqueId);
    }

    cacheAllDOM() {
        this.elUserName = document.getElementById('userDisplayName');
        this.elUserId = document.getElementById('userUniqueId');
        this.elMyIdInAdd = document.getElementById('myIdInAddFriend');
        this.elLogoutBtn = document.getElementById('logoutBtn');
        this.elFriendsCount = document.getElementById('friendsCount');
        this.elUnreadCount = document.getElementById('unreadCount');
        this.elFriendsList = document.getElementById('friendsList');
        this.elAllFriendsList = document.getElementById('allFriendsList');
        
        // Модалки
        this.modalAddFriend = document.getElementById('addFriendModal');
        this.modalMessages = document.getElementById('messagesModal');
        this.modalFriendsList = document.getElementById('friendsListModal');
        this.modalProfile = document.getElementById('profileModal');
        
        // Кнопки
        this.btnOpenMessages = document.getElementById('btnOpenMessages');
        this.btnOpenAddFriend = document.getElementById('btnOpenAddFriend');
        this.btnOpenFriendsList = document.getElementById('btnOpenFriendsList');
        this.btnOpenProfile = document.getElementById('btnOpenProfile');
        this.btnFriends = document.getElementById('btnFriends');
        this.btnMessages = document.getElementById('btnMessages');
        this.openProfileFromHeader = document.getElementById('openProfileFromHeader');
        
        // Закрытие
        this.btnCloseAddFriend = document.getElementById('closeAddFriend');
        this.btnCloseMessages = document.getElementById('closeMessages');
        this.btnCloseFriendsList = document.getElementById('closeFriendsList');
        this.btnCloseProfile = document.getElementById('closeProfile');
        
        // Добавление друга
        this.inputFriendId = document.getElementById('friendIdInput');
        this.btnSearchFriend = document.getElementById('searchFriendBtn');
        this.elSearchResult = document.getElementById('searchResult');
        
        // Мессенджер
        this.elUserSearch = document.getElementById('userSearch');
        this.elChatMessages = document.getElementById('chatMessages');
        this.elChatUserName = document.getElementById('chatUserName');
        this.elChatStatus = document.getElementById('chatStatus');
        this.inputMessage = document.getElementById('messageInput');
        this.btnSendMessage = document.getElementById('sendMessageBtn');
        this.btnDeleteChat = document.getElementById('deleteChatBtn');
        this.btnAttachImage = document.getElementById('attachImageBtn');
        this.imageInput = document.getElementById('imageInput');
        
        // Профиль
        this.headerAvatar = document.getElementById('headerAvatar');
        this.profileAvatarLarge = document.getElementById('profileAvatarLarge');
        this.profileCover = document.getElementById('profileCover');
        this.changeAvatarBtn = document.getElementById('changeAvatarBtnLarge');
        this.avatarInput = document.getElementById('avatarInputLarge');
        this.changeCoverBtn = document.getElementById('changeCoverBtn');
        this.coverInput = document.getElementById('coverInput');
        this.profileName = document.getElementById('profileName');
        this.profileBio = document.getElementById('profileBio');
        this.profileEmail = document.getElementById('profileEmail');
        this.profileId = document.getElementById('profileId');
        this.saveProfileBtn = document.getElementById('saveProfileBtn');
        this.nameChangeInfo = document.getElementById('nameChangeInfo');
        this.lastNameChange = document.getElementById('lastNameChange');
        
        // Контекстное меню
        this.contextMenu = document.getElementById('messageContextMenu');
        this.menuDeleteMessage = document.getElementById('menuDeleteMessage');
        this.menuPinMessage = document.getElementById('menuPinMessage');
        this.menuUnpinMessage = document.getElementById('menuUnpinMessage');
        this.menuCopyText = document.getElementById('menuCopyText');
    }

    bindAllEvents() {
        this.elLogoutBtn.addEventListener('click', () => this.logout());
        
        if (this.btnOpenMessages) this.btnOpenMessages.addEventListener('click', () => this.openModal(this.modalMessages));
        if (this.btnOpenAddFriend) this.btnOpenAddFriend.addEventListener('click', () => this.openModal(this.modalAddFriend));
        if (this.btnOpenFriendsList) this.btnOpenFriendsList.addEventListener('click', () => this.openModal(this.modalFriendsList));
        if (this.btnOpenProfile) this.btnOpenProfile.addEventListener('click', () => this.openProfileModal());
        if (this.openProfileFromHeader) this.openProfileFromHeader.addEventListener('click', () => this.openProfileModal());
        if (this.btnFriends) this.btnFriends.addEventListener('click', () => this.openModal(this.modalFriendsList));
        if (this.btnMessages) this.btnMessages.addEventListener('click', () => this.openModal(this.modalMessages));
        
        if (this.btnCloseAddFriend) this.btnCloseAddFriend.addEventListener('click', () => this.closeModal(this.modalAddFriend));
        if (this.btnCloseMessages) this.btnCloseMessages.addEventListener('click', () => this.closeModal(this.modalMessages));
        if (this.btnCloseFriendsList) this.btnCloseFriendsList.addEventListener('click', () => this.closeModal(this.modalFriendsList));
        if (this.btnCloseProfile) this.btnCloseProfile.addEventListener('click', () => this.closeModal(this.modalProfile));
        
        [this.modalAddFriend, this.modalMessages, this.modalFriendsList, this.modalProfile].forEach(modal => {
            if (modal) {
                modal.addEventListener('click', e => { if (e.target === modal) this.closeModal(modal); });
            }
        });
        
        if (this.btnSearchFriend) {
            this.btnSearchFriend.addEventListener('click', () => this.searchFriend());
            this.inputFriendId.addEventListener('keypress', e => { if (e.key === 'Enter') this.searchFriend(); });
        }
        
        if (this.elUserSearch) this.elUserSearch.addEventListener('input', () => this.renderFriendsList());
        
        if (this.btnSendMessage) {
            this.btnSendMessage.addEventListener('click', () => this.sendMessage());
            this.inputMessage.addEventListener('keypress', e => { if (e.key === 'Enter') this.sendMessage(); });
        }
        
        if (this.btnAttachImage) {
            this.btnAttachImage.addEventListener('click', () => this.imageInput.click());
            this.imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
        }
        
        if (this.btnDeleteChat) this.btnDeleteChat.addEventListener('click', () => this.deleteCurrentChat());
        
        if (this.changeAvatarBtn) {
            this.changeAvatarBtn.addEventListener('click', () => this.avatarInput.click());
            this.avatarInput.addEventListener('change', (e) => this.handleAvatarChange(e));
        }
        
        if (this.changeCoverBtn) {
            this.changeCoverBtn.addEventListener('click', () => this.coverInput.click());
            this.coverInput.addEventListener('change', (e) => this.handleCoverChange(e));
        }
        
        if (this.saveProfileBtn) this.saveProfileBtn.addEventListener('click', () => this.saveProfileChanges());
        
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                [this.modalAddFriend, this.modalMessages, this.modalFriendsList, this.modalProfile].forEach(m => {
                    if (m && m.classList.contains('show')) this.closeModal(m);
                });
                this.hideContextMenu();
            }
        });
        
        document.addEventListener('click', () => this.hideContextMenu());
        
        if (this.menuDeleteMessage) {
            this.menuDeleteMessage.addEventListener('click', () => this.deleteSelectedMessage());
            this.menuPinMessage.addEventListener('click', () => this.pinSelectedMessage());
            this.menuUnpinMessage.addEventListener('click', () => this.unpinSelectedMessage());
            this.menuCopyText.addEventListener('click', () => this.copyMessageText());
        }
    }

    initContextMenu() {
        if (!this.elChatMessages) return;
        
        this.elChatMessages.addEventListener('contextmenu', (e) => {
            const messageDiv = e.target.closest('.message');
            if (!messageDiv) return;
            
            e.preventDefault();
            const messageId = parseInt(messageDiv.dataset.messageId);
            this.selectedMessageId = messageId;
            
            const message = this.getMessageById(messageId);
            if (message) {
                if (this.menuDeleteMessage) {
                    this.menuDeleteMessage.style.display = message.from === this.currentUser.uniqueId ? 'block' : 'none';
                }
                
                if (this.menuPinMessage && this.menuUnpinMessage) {
                    if (message.pinned) {
                        this.menuPinMessage.style.display = 'none';
                        this.menuUnpinMessage.style.display = 'block';
                    } else {
                        this.menuPinMessage.style.display = 'block';
                        this.menuUnpinMessage.style.display = 'none';
                    }
                }
                
                if (this.contextMenu) {
                    this.contextMenu.style.display = 'block';
                    this.contextMenu.style.left = e.pageX + 'px';
                    this.contextMenu.style.top = e.pageY + 'px';
                }
            }
        });
    }

    getMessageById(messageId) {
        if (!this.selectedChat) return null;
        const messages = this.msg.getConversation(this.currentUser.uniqueId, this.selectedChat.uniqueId);
        return messages.find(m => m.id === messageId);
    }

    deleteSelectedMessage() {
        if (!this.selectedChat || !this.selectedMessageId) return;
        if (confirm('Удалить это сообщение?')) {
            const chatId = this.msg.getChatId(this.currentUser.uniqueId, this.selectedChat.uniqueId);
            this.msg.deleteMessage(chatId, this.selectedMessageId);
            this.renderChatHistory();
            this.hideContextMenu();
            this.showToast('Сообщение удалено');
        }
    }

    pinSelectedMessage() {
        if (!this.selectedChat || !this.selectedMessageId) return;
        const chatId = this.msg.getChatId(this.currentUser.uniqueId, this.selectedChat.uniqueId);
        this.msg.pinMessage(chatId, this.selectedMessageId);
        this.renderChatHistory();
        this.hideContextMenu();
        this.showToast('Сообщение закреплено');
    }

    unpinSelectedMessage() {
        if (!this.selectedChat || !this.selectedMessageId) return;
        const chatId = this.msg.getChatId(this.currentUser.uniqueId, this.selectedChat.uniqueId);
        this.msg.unpinMessage(chatId, this.selectedMessageId);
        this.renderChatHistory();
        this.hideContextMenu();
        this.showToast('Сообщение откреплено');
    }

    copyMessageText() {
        if (!this.selectedMessageId) return;
        const message = this.getMessageById(this.selectedMessageId);
        if (message && message.text) {
            navigator.clipboard.writeText(message.text);
            this.showToast('Текст скопирован');
        }
        this.hideContextMenu();
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.selectedChat) return;
        
        if (!file.type.startsWith('image/')) {
            this.showToast('Пожалуйста, выберите изображение');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            this.msg.send(this.currentUser.uniqueId, this.selectedChat.uniqueId, '', event.target.result);
            this.renderChatHistory();
            this.renderFriendsList();
            this.updateCounts();
            this.scrollToBottom();
        };
        reader.readAsDataURL(file);
        this.imageInput.value = '';
    }

    hideContextMenu() {
        if (this.contextMenu) this.contextMenu.style.display = 'none';
        this.selectedMessageId = null;
    }

    updateUI() {
        if (!this.currentUser) return;
        
        this.elUserName.textContent = this.currentUser.name;
        this.elUserId.textContent = this.currentUser.uniqueId;
        if (this.elMyIdInAdd) this.elMyIdInAdd.textContent = this.currentUser.uniqueId;
        
        if (this.currentUser.avatar) {
            this.headerAvatar.innerHTML = `<img src="${this.currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        }
        
        this.updateCounts();
    }

    updateCounts() {
        const friends = this.db.getFriends(this.currentUser.email);
        this.elFriendsCount.textContent = friends.length;
        this.elUnreadCount.textContent = this.msg.getUnreadCount(this.currentUser.uniqueId);
    }

    openModal(modal) {
        if (!modal) return;
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        if (modal === this.modalMessages) {
            this.renderFriendsList();
            this.updateCounts();
        }
        if (modal === this.modalFriendsList) this.renderAllFriends();
        if (modal === this.modalAddFriend) {
            if (this.inputFriendId) this.inputFriendId.value = '';
            if (this.elSearchResult) this.elSearchResult.innerHTML = '';
        }
    }

    closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('show');
        document.body.style.overflow = 'auto';
    }

    openProfileModal() {
        this.loadProfileData();
        this.openModal(this.modalProfile);
    }

    loadProfileData() {
        const user = this.db.findUserByEmail(this.currentUser.email);
        if (user) {
            this.profileName.value = user.name;
            this.profileBio.value = user.bio || '';
            this.profileEmail.value = user.email;
            this.profileId.value = user.uniqueId;
            
            if (user.avatar) {
                this.profileAvatarLarge.innerHTML = `<img src="${user.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
            } else {
                this.profileAvatarLarge.innerHTML = '👤';
            }
            
            if (user.cover) {
                this.profileCover.style.backgroundImage = `url(${user.cover})`;
                this.profileCover.style.backgroundSize = 'cover';
                this.profileCover.style.backgroundPosition = 'center';
            } else {
                this.profileCover.style.backgroundImage = 'linear-gradient(135deg, #1a1a1a, #0a0a0a)';
            }
            
            const lastChange = user.lastNameChange || 0;
            const now = Date.now();
            const hoursSinceLastChange = (now - lastChange) / (1000 * 60 * 60);
            
            if (hoursSinceLastChange < 1 && lastChange > 0) {
                this.profileName.disabled = true;
                const minutesLeft = Math.ceil((60 - (hoursSinceLastChange * 60)));
                this.nameChangeInfo.textContent = `⚠️ Имя можно изменить через ${minutesLeft} минут`;
                this.nameChangeInfo.style.color = '#ffaa00';
            } else {
                this.profileName.disabled = false;
                this.nameChangeInfo.textContent = '✅ Имя можно изменить';
                this.nameChangeInfo.style.color = '#00ff88';
            }
            
            if (lastChange > 0) {
                const lastChangeDate = new Date(lastChange);
                this.lastNameChange.textContent = `Последнее изменение: ${lastChangeDate.toLocaleString()}`;
            } else {
                this.lastNameChange.textContent = 'Имя еще не меняли';
            }
        }
    }

    handleAvatarChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.showToast('Пожалуйста, выберите изображение');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            this.saveAvatar(event.target.result);
        };
        reader.readAsDataURL(file);
    }

    handleCoverChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.showToast('Пожалуйста, выберите изображение');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            this.saveCover(event.target.result);
        };
        reader.readAsDataURL(file);
    }

    saveAvatar(avatarData) {
        this.db.updateUser(this.currentUser.email, { avatar: avatarData });
        this.currentUser.avatar = avatarData;
        
        const savedUser = localStorage.getItem('currentUser') ? 
            JSON.parse(localStorage.getItem('currentUser')) : 
            JSON.parse(sessionStorage.getItem('currentUser'));
        if (savedUser) {
            savedUser.avatar = avatarData;
            if (localStorage.getItem('currentUser')) {
                localStorage.setItem('currentUser', JSON.stringify(savedUser));
            } else {
                sessionStorage.setItem('currentUser', JSON.stringify(savedUser));
            }
        }
        
        this.profileAvatarLarge.innerHTML = `<img src="${avatarData}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        this.headerAvatar.innerHTML = `<img src="${avatarData}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        this.showToast('Аватар обновлен');
    }

    saveCover(coverData) {
        this.db.updateUser(this.currentUser.email, { cover: coverData });
        this.currentUser.cover = coverData;
        this.profileCover.style.backgroundImage = `url(${coverData})`;
        this.profileCover.style.backgroundSize = 'cover';
        this.profileCover.style.backgroundPosition = 'center';
        this.showToast('Обложка обновлена');
    }

    saveProfileChanges() {
        const newName = this.profileName.value.trim();
        const newBio = this.profileBio.value.trim();
        
        if (!newName) {
            this.showToast('Имя не может быть пустым');
            return;
        }
        
        const user = this.db.findUserByEmail(this.currentUser.email);
        if (user) {
            const lastChange = user.lastNameChange || 0;
            const now = Date.now();
            const hoursSinceLastChange = (now - lastChange) / (1000 * 60 * 60);
            
            if (hoursSinceLastChange < 1 && lastChange > 0 && user.name !== newName) {
                const minutesLeft = Math.ceil((60 - (hoursSinceLastChange * 60)));
                this.showToast(`Имя можно изменить через ${minutesLeft} минут`);
                return;
            }
            
            const updates = { name: newName, bio: newBio };
            if (user.name !== newName) updates.lastNameChange = now;
            
            this.db.updateUser(this.currentUser.email, updates);
            this.currentUser.name = newName;
            this.currentUser.bio = newBio;
            
            const savedUser = localStorage.getItem('currentUser') ? 
                JSON.parse(localStorage.getItem('currentUser')) : 
                JSON.parse(sessionStorage.getItem('currentUser'));
            if (savedUser) {
                savedUser.name = newName;
                savedUser.bio = newBio;
                if (localStorage.getItem('currentUser')) {
                    localStorage.setItem('currentUser', JSON.stringify(savedUser));
                } else {
                    sessionStorage.setItem('currentUser', JSON.stringify(savedUser));
                }
            }
            
            this.updateUI();
            this.showToast('Профиль обновлен!');
            this.loadProfileData();
            
            if (this.modalMessages && this.modalMessages.classList.contains('show')) {
                this.renderFriendsList();
            }
        }
    }

    searchFriend() {
        const friendId = this.inputFriendId.value.trim().toUpperCase();
        this.elSearchResult.innerHTML = '';
        
        if (!friendId) {
            this.elSearchResult.innerHTML = '<p style="color:#ff4444;">Введите ID</p>';
            return;
        }
        
        if (friendId === this.currentUser.uniqueId) {
            this.elSearchResult.innerHTML = '<p style="color:#ff4444;">Это ваш ID</p>';
            return;
        }
        
        const user = this.db.findUserByUniqueId(friendId);
        
        if (!user) {
            this.elSearchResult.innerHTML = '<p style="color:#ff4444;">Пользователь не найден</p>';
            return;
        }
        
        const friends = this.db.getFriends(this.currentUser.email);
        const alreadyFriend = friends.some(f => f.uniqueId === friendId);
        
        if (alreadyFriend) {
            this.elSearchResult.innerHTML = `<div class="found-user"><span>👤 ${this.escapeHtml(user.name)}</span><span style="color:#ffaa00;">Уже в друзьях</span></div>`;
            return;
        }
        
        this.elSearchResult.innerHTML = `
            <div class="found-user">
                <div>
                    <div style="color:#fff;font-weight:600;">${this.escapeHtml(user.name)}</div>
                    <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">${this.escapeHtml(user.email)}</div>
                </div>
                <button class="add-friend-btn" id="confirmAddFriend">Добавить</button>
            </div>
        `;
        
        document.getElementById('confirmAddFriend').addEventListener('click', () => {
            this.confirmAddFriend(friendId);
        });
    }

    confirmAddFriend(friendId) {
        const success = this.db.addFriend(this.currentUser.email, friendId);
        
        if (success) {
            const user = this.db.findUserByUniqueId(friendId);
            this.elSearchResult.innerHTML = `<p style="color:#00ff88;">${this.escapeHtml(user.name)} добавлен в друзья!</p>`;
            this.inputFriendId.value = '';
            this.updateCounts();
            if (this.modalMessages && this.modalMessages.classList.contains('show')) this.renderFriendsList();
        } else {
            this.elSearchResult.innerHTML = '<p style="color:#ff4444;">Ошибка</p>';
        }
    }

    renderFriendsList() {
        const friends = this.db.getFriends(this.currentUser.email);
        const query = this.elUserSearch ? this.elUserSearch.value.toLowerCase() : '';
        
        const filtered = friends.filter(f => f.name.toLowerCase().includes(query) || f.email.toLowerCase().includes(query));
        
        if (filtered.length === 0) {
            this.elFriendsList.innerHTML = `<div style="text-align:center;padding:2rem;color:rgba(255,255,255,0.3);">${friends.length === 0 ? 'У вас нет друзей. Добавьте друзей по ID!' : 'Ничего не найдено'}</div>`;
            return;
        }
        
        this.elFriendsList.innerHTML = filtered.map(f => {
            const lastMsg = this.msg.getLastMessage(this.currentUser.uniqueId, f.uniqueId);
            const lastText = lastMsg ? (lastMsg.text ? lastMsg.text.substring(0, 25) : '📷 Изображение') : 'Нет сообщений';
            const unread = this.msg.getConversation(this.currentUser.uniqueId, f.uniqueId).filter(m => m.to === this.currentUser.uniqueId && !m.read).length;
            
            return `
                <div class="user-item ${this.selectedChat?.uniqueId === f.uniqueId ? 'active' : ''}" data-uid="${f.uniqueId}">
                    <div class="user-item-avatar">${f.avatar ? '<img src="' + f.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👤'}</div>
                    <div class="user-item-info" style="flex:1">
                        <div class="user-item-name">${this.escapeHtml(f.name)}</div>
                        <div class="user-item-email">${this.escapeHtml(lastText)}</div>
                    </div>
                    ${unread > 0 ? `<span class="user-item-badge">${unread}</span>` : ''}
                    <button class="remove-friend-btn" data-uid="${f.uniqueId}" title="Удалить">✕</button>
                </div>
            `;
        }).join('');
        
        this.elFriendsList.querySelectorAll('.user-item').forEach(item => {
            item.addEventListener('click', e => {
                if (!e.target.classList.contains('remove-friend-btn')) {
                    this.selectChat(item.dataset.uid);
                }
            });
        });
        
        this.elFriendsList.querySelectorAll('.remove-friend-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this.removeFriend(btn.dataset.uid);
            });
        });
    }

    renderAllFriends() {
        const friends = this.db.getFriends(this.currentUser.email);
        
        if (friends.length === 0) {
            this.elAllFriendsList.innerHTML = `<div style="text-align:center;padding:2rem;color:rgba(255,255,255,0.3);">У вас пока нет друзей</div>`;
            return;
        }
        
        this.elAllFriendsList.innerHTML = friends.map(f => `
            <div class="user-item" style="justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:1rem;">
                    <div class="user-item-avatar">${f.avatar ? '<img src="' + f.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👤'}</div>
                    <div>
                        <div style="color:#fff;font-weight:600;">${this.escapeHtml(f.name)}</div>
                        <div style="color:rgba(255,255,255,0.4);font-size:0.8rem;">ID: ${f.uniqueId}</div>
                        ${f.bio ? `<div style="color:rgba(255,255,255,0.3);font-size:0.7rem;margin-top:2px;">${this.escapeHtml(f.bio.substring(0, 50))}</div>` : ''}
                    </div>
                </div>
                <button class="remove-friend-btn" data-uid="${f.uniqueId}">Удалить</button>
            </div>
        `).join('');
        
        this.elAllFriendsList.querySelectorAll('.remove-friend-btn').forEach(btn => {
            btn.addEventListener('click', () => this.removeFriend(btn.dataset.uid));
        });
    }

    removeFriend(friendId) {
        if (confirm('Удалить из друзей?')) {
            this.db.removeFriend(this.currentUser.email, friendId);
            this.msg.deleteChat(this.currentUser.uniqueId, friendId);
            if (this.selectedChat?.uniqueId === friendId) this.clearChat();
            this.renderFriendsList();
            this.renderAllFriends();
            this.updateCounts();
            this.showToast('Друг удален');
        }
    }

    selectChat(friendId) {
        const friends = this.db.getFriends(this.currentUser.email);
        const friend = friends.find(f => f.uniqueId === friendId);
        if (!friend) return;
        
        this.selectedChat = friend;
        this.elChatUserName.textContent = friend.name;
        this.elChatStatus.textContent = 'Онлайн';
        this.inputMessage.disabled = false;
        this.btnSendMessage.disabled = false;
        this.btnDeleteChat.style.display = 'block';
        
        this.msg.markAsRead(friend.uniqueId, this.currentUser.uniqueId);
        this.renderChatHistory();
        this.renderFriendsList();
        this.updateCounts();
        
        setTimeout(() => this.inputMessage.focus(), 100);
    }

    renderChatHistory() {
        if (!this.selectedChat) return;
        
        const wasAtBottom = this.isScrolledToBottom();
        const oldScrollTop = this.elChatMessages.scrollTop;
        const oldScrollHeight = this.elChatMessages.scrollHeight;
        
        const messages = this.msg.getConversation(this.currentUser.uniqueId, this.selectedChat.uniqueId);
        const pinnedMessage = this.msg.getPinnedMessage(this.msg.getChatId(this.currentUser.uniqueId, this.selectedChat.uniqueId));
        
        let pinnedHtml = '';
        if (pinnedMessage) {
            pinnedHtml = `<div class="pinned-message"><span class="pin-icon">📌</span><span>Закрепленное сообщение: ${this.escapeHtml(pinnedMessage.text || '📷 Изображение')}</span></div>`;
        }
        
        if (messages.length === 0) {
            this.elChatMessages.innerHTML = pinnedHtml + `<div class="no-chat-selected"><div class="no-chat-icon">💬</div><p>Начните общение!</p></div>`;
            return;
        }
        
        this.elChatMessages.innerHTML = pinnedHtml + messages.map(m => {
            const isSent = m.from === this.currentUser.uniqueId;
            const time = new Date(m.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const messageContent = m.image ? 
                `<img src="${m.image}" class="message-image" alt="Изображение" onclick="window.open(this.src)">` : 
                `<div class="message-content">${this.escapeHtml(m.text)}</div>`;
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'} ${m.pinned ? 'pinned' : ''}" data-message-id="${m.id}">
                    <div class="message-avatar">${isSent ? (this.currentUser.avatar ? '<img src="' + this.currentUser.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👤') : (this.selectedChat.avatar ? '<img src="' + this.selectedChat.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👥')}</div>
                    <div>
                        ${messageContent}
                        <div class="message-time">${time} ${m.pinned ? '📌' : ''}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (wasAtBottom) {
            this.elChatMessages.scrollTop = this.elChatMessages.scrollHeight;
        } else {
            const newScrollHeight = this.elChatMessages.scrollHeight;
            const heightDiff = newScrollHeight - oldScrollHeight;
            if (heightDiff > 0 && oldScrollTop > 0) {
                this.elChatMessages.scrollTop = oldScrollTop + heightDiff;
            } else {
                this.elChatMessages.scrollTop = oldScrollTop;
            }
        }
    }
    
    isScrolledToBottom() {
        const element = this.elChatMessages;
        return Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 50;
    }
    
    scrollToBottom() {
        setTimeout(() => {
            this.elChatMessages.scrollTop = this.elChatMessages.scrollHeight;
        }, 50);
    }

    sendMessage() {
        const text = this.inputMessage.value.trim();
        if (!text && (!this.imageInput || !this.imageInput.files.length)) return;
        if (!this.selectedChat) return;
        
        this.msg.send(this.currentUser.uniqueId, this.selectedChat.uniqueId, text);
        this.inputMessage.value = '';
        this.renderChatHistory();
        this.renderFriendsList();
        this.updateCounts();
        this.scrollToBottom();
    }

    deleteCurrentChat() {
        if (!this.selectedChat) return;
        if (confirm('Удалить всю переписку?')) {
            this.msg.deleteChat(this.currentUser.uniqueId, this.selectedChat.uniqueId);
            this.renderChatHistory();
            this.renderFriendsList();
            this.showToast('Чат очищен');
        }
    }

    clearChat() {
        this.selectedChat = null;
        this.elChatUserName.textContent = 'Выберите чат';
        this.elChatStatus.textContent = '';
        this.inputMessage.disabled = true;
        this.btnSendMessage.disabled = true;
        this.btnDeleteChat.style.display = 'none';
        this.elChatMessages.innerHTML = `<div class="no-chat-selected"><div class="no-chat-icon">💬</div><p>Выберите друга для начала общения</p></div>`;
    }

    startPolling() {
        let lastUpdateTime = 0;
        setInterval(() => {
            if (this.modalMessages && this.modalMessages.classList.contains('show')) {
                const now = Date.now();
                if (now - lastUpdateTime > 2000) {
                    this.updateCounts();
                    this.renderFriendsList();
                    lastUpdateTime = now;
                }
            }
        }, 2000);
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 20px',
            background: '#000',
            color: '#fff',
            borderRadius: '8px',
            zIndex: '9999',
            border: '1px solid rgba(255,255,255,0.2)',
            animation: 'fadeInUp 0.3s ease',
            fontSize: '13px'
        });
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    logout() {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
        window.location.replace('index.html');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HomeApp();
});