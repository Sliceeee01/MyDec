// ============================================
// ДЛЯ РАБОТЫ С FIREBASE
// ============================================
let db, firebaseRef, firebaseSet, firebaseGet, firebasePush, firebaseUpdate, firebaseOnValue, firebaseRemove;

function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.db) {
                db = window.db;
                firebaseRef = window.firebaseRef;
                firebaseSet = window.firebaseSet;
                firebaseGet = window.firebaseGet;
                firebasePush = window.firebasePush;
                firebaseUpdate = window.firebaseUpdate;
                firebaseOnValue = window.firebaseOnValue;
                firebaseRemove = window.firebaseRemove;
                clearInterval(checkInterval);
                console.log('Firebase готов');
                resolve();
            }
        }, 100);
    });
}

// ============================================
// БАЗА ДАННЫХ
// ============================================
class Database {
    async findUserByEmail(email) {
        await waitForFirebase();
        const usersRef = firebaseRef(db, 'users');
        const snapshot = await firebaseGet(usersRef);
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
        await waitForFirebase();
        const usersRef = firebaseRef(db, 'users');
        const snapshot = await firebaseGet(usersRef);
        const users = snapshot.val();
        if (!users) return null;
        
        for (let key in users) {
            if (users[key].uniqueId === uniqueId.toUpperCase()) {
                return { ...users[key], id: key };
            }
        }
        return null;
    }

    async addFriend(userEmail, friendId) {
        await waitForFirebase();
        const user = await this.findUserByEmail(userEmail);
        const friend = await this.findUserByUniqueId(friendId);
        
        if (!user || !friend || user.email === friend.email) return false;
        
        if (!user.friends) user.friends = [];
        if (!friend.friends) friend.friends = [];
        
        if (!user.friends.includes(friendId)) {
            user.friends.push(friendId);
            await firebaseUpdate(firebaseRef(db, 'users/' + user.id), { friends: user.friends });
        }
        
        if (!friend.friends.includes(user.uniqueId)) {
            friend.friends.push(user.uniqueId);
            await firebaseUpdate(firebaseRef(db, 'users/' + friend.id), { friends: friend.friends });
        }
        
        return true;
    }

    async removeFriend(userEmail, friendId) {
        await waitForFirebase();
        const user = await this.findUserByEmail(userEmail);
        const friend = await this.findUserByUniqueId(friendId);
        
        if (!user || !friend) return false;
        
        if (user.friends) {
            user.friends = user.friends.filter(id => id !== friendId);
            await firebaseUpdate(firebaseRef(db, 'users/' + user.id), { friends: user.friends });
        }
        
        if (friend.friends) {
            friend.friends = friend.friends.filter(id => id !== user.uniqueId);
            await firebaseUpdate(firebaseRef(db, 'users/' + friend.id), { friends: friend.friends });
        }
        
        return true;
    }

    async getFriends(userEmail) {
        await waitForFirebase();
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
        await waitForFirebase();
        const user = await this.findUserByEmail(email);
        if (user) {
            await firebaseUpdate(firebaseRef(db, 'users/' + user.id), updates);
            return true;
        }
        return false;
    }
}

// ============================================
// МЕНЕДЖЕР СООБЩЕНИЙ
// ============================================
class MessageManager {
    async send(fromId, toId, text, image = null) {
        await waitForFirebase();
        const chatId = [fromId, toId].sort().join('___');
        const messagesRef = firebaseRef(db, 'messages/' + chatId);
        const newMessageRef = firebasePush(messagesRef);
        
        await firebaseSet(newMessageRef, {
            id: Date.now(),
            from: fromId,
            to: toId,
            text: text,
            image: image,
            pinned: false,
            time: new Date().toISOString(),
            read: false
        });
    }

    async getConversation(id1, id2) {
        await waitForFirebase();
        const chatId = [id1, id2].sort().join('___');
        const messagesRef = firebaseRef(db, 'messages/' + chatId);
        const snapshot = await firebaseGet(messagesRef);
        const messages = snapshot.val();
        if (!messages) return [];
        return Object.values(messages).sort((a, b) => a.id - b.id);
    }

    async getUnreadCount(userId) {
        await waitForFirebase();
        const messagesRef = firebaseRef(db, 'messages');
        const snapshot = await firebaseGet(messagesRef);
        const allMessages = snapshot.val();
        let count = 0;
        
        if (allMessages) {
            for (let chatId in allMessages) {
                for (let key in allMessages[chatId]) {
                    if (allMessages[chatId][key].to === userId && !allMessages[chatId][key].read) count++;
                }
            }
        }
        return count;
    }

    async markAsRead(fromId, toId) {
        await waitForFirebase();
        const chatId = [fromId, toId].sort().join('___');
        const messagesRef = firebaseRef(db, 'messages/' + chatId);
        const snapshot = await firebaseGet(messagesRef);
        const messages = snapshot.val();
        
        if (messages) {
            for (let key in messages) {
                if (messages[key].to === toId && !messages[key].read) {
                    await firebaseUpdate(firebaseRef(db, 'messages/' + chatId + '/' + key), { read: true });
                }
            }
        }
    }

    async deleteChat(id1, id2) {
        await waitForFirebase();
        const chatId = [id1, id2].sort().join('___');
        await firebaseRemove(firebaseRef(db, 'messages/' + chatId));
    }

    async getLastMessage(id1, id2) {
        const conv = await this.getConversation(id1, id2);
        return conv[conv.length - 1];
    }

    subscribeToMessages(id1, id2, callback) {
        const chatId = [id1, id2].sort().join('___');
        const messagesRef = firebaseRef(db, 'messages/' + chatId);
        
        return firebaseOnValue(messagesRef, (snapshot) => {
            const messages = snapshot.val();
            if (messages) {
                const messagesArray = Object.values(messages).sort((a, b) => a.id - b.id);
                callback(messagesArray);
            } else {
                callback([]);
            }
        });
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
        this.messageUnsubscribe = null;
        
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadUserData();
        this.cacheAllDOM();
        this.bindAllEvents();
        await this.updateUI();
        this.startPolling();
        this.initContextMenu();
        console.log('HomeApp готов');
    }

    async checkAuth() {
        const saved = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        
        if (!saved) {
            window.location.replace('index.html');
            return;
        }
        
        try {
            this.currentUser = JSON.parse(saved);
            console.log('Пользователь:', this.currentUser.name);
        } catch (error) {
            console.error('Ошибка:', error);
            window.location.replace('index.html');
        }
    }

    async loadUserData() {
        const userFromDb = await this.db.findUserByEmail(this.currentUser.email);
        if (userFromDb) {
            this.currentUser.id = userFromDb.id;
            this.currentUser.friends = userFromDb.friends || [];
            this.currentUser.avatar = userFromDb.avatar;
            this.currentUser.bio = userFromDb.bio;
            this.currentUser.cover = userFromDb.cover;
        }
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
        
        this.modalAddFriend = document.getElementById('addFriendModal');
        this.modalMessages = document.getElementById('messagesModal');
        this.modalFriendsList = document.getElementById('friendsListModal');
        this.modalProfile = document.getElementById('profileModal');
        
        this.btnOpenMessages = document.getElementById('btnOpenMessages');
        this.btnOpenAddFriend = document.getElementById('btnOpenAddFriend');
        this.btnOpenFriendsList = document.getElementById('btnOpenFriendsList');
        this.btnOpenProfile = document.getElementById('btnOpenProfile');
        this.btnFriends = document.getElementById('btnFriends');
        this.btnMessages = document.getElementById('btnMessages');
        this.openProfileFromHeader = document.getElementById('openProfileFromHeader');
        
        this.btnCloseAddFriend = document.getElementById('closeAddFriend');
        this.btnCloseMessages = document.getElementById('closeMessages');
        this.btnCloseFriendsList = document.getElementById('closeFriendsList');
        this.btnCloseProfile = document.getElementById('closeProfile');
        
        this.inputFriendId = document.getElementById('friendIdInput');
        this.btnSearchFriend = document.getElementById('searchFriendBtn');
        this.elSearchResult = document.getElementById('searchResult');
        
        this.elUserSearch = document.getElementById('userSearch');
        this.elChatMessages = document.getElementById('chatMessages');
        this.elChatUserName = document.getElementById('chatUserName');
        this.elChatStatus = document.getElementById('chatStatus');
        this.inputMessage = document.getElementById('messageInput');
        this.btnSendMessage = document.getElementById('sendMessageBtn');
        this.btnDeleteChat = document.getElementById('deleteChatBtn');
        this.btnAttachImage = document.getElementById('attachImageBtn');
        this.imageInput = document.getElementById('imageInput');
        
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
            if (modal) modal.addEventListener('click', e => { if (e.target === modal) this.closeModal(modal); });
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

    showToast(message, isError = false) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.style.display = 'none';
                toast.style.opacity = '1';
            }, 300);
        }, 3000);
    }

    async updateUI() {
        this.elUserName.textContent = this.currentUser.name;
        this.elUserId.textContent = this.currentUser.uniqueId;
        if (this.elMyIdInAdd) this.elMyIdInAdd.textContent = this.currentUser.uniqueId;
        
        if (this.currentUser.avatar) {
            this.headerAvatar.innerHTML = `<img src="${this.currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        }
        
        await this.updateCounts();
    }

    async updateCounts() {
        const friends = await this.db.getFriends(this.currentUser.email);
        this.elFriendsCount.textContent = friends.length;
        this.elUnreadCount.textContent = await this.msg.getUnreadCount(this.currentUser.uniqueId);
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

    async loadProfileData() {
        const user = await this.db.findUserByEmail(this.currentUser.email);
        if (user) {
            this.profileName.value = user.name;
            this.profileBio.value = user.bio || '';
            this.profileEmail.value = user.email;
            this.profileId.value = user.uniqueId;
            
            if (user.avatar) {
                this.profileAvatarLarge.innerHTML = `<img src="${user.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
            }
            
            if (user.cover) {
                this.profileCover.style.backgroundImage = `url(${user.cover})`;
                this.profileCover.style.backgroundSize = 'cover';
            }
        }
    }

    async handleAvatarChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            await this.db.updateUser(this.currentUser.email, { avatar: event.target.result });
            this.currentUser.avatar = event.target.result;
            this.profileAvatarLarge.innerHTML = `<img src="${event.target.result}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
            this.headerAvatar.innerHTML = `<img src="${event.target.result}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
            this.showToast('Аватар обновлен');
        };
        reader.readAsDataURL(file);
    }

    async handleCoverChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            await this.db.updateUser(this.currentUser.email, { cover: event.target.result });
            this.profileCover.style.backgroundImage = `url(${event.target.result})`;
            this.profileCover.style.backgroundSize = 'cover';
            this.showToast('Обложка обновлена');
        };
        reader.readAsDataURL(file);
    }

    async saveProfileChanges() {
        const newName = this.profileName.value.trim();
        const newBio = this.profileBio.value.trim();
        
        if (!newName) {
            this.showToast('Имя не может быть пустым', true);
            return;
        }
        
        await this.db.updateUser(this.currentUser.email, { name: newName, bio: newBio });
        this.currentUser.name = newName;
        this.currentUser.bio = newBio;
        
        const savedUser = JSON.parse(localStorage.getItem('currentUser'));
        savedUser.name = newName;
        localStorage.setItem('currentUser', JSON.stringify(savedUser));
        
        this.updateUI();
        this.showToast('Профиль обновлен');
    }

    async searchFriend() {
        const friendId = this.inputFriendId.value.trim().toUpperCase();
        this.elSearchResult.innerHTML = '';
        
        if (!friendId) {
            this.showToast('Введите ID', true);
            return;
        }
        
        if (friendId === this.currentUser.uniqueId) {
            this.showToast('Это ваш ID', true);
            return;
        }
        
        const user = await this.db.findUserByUniqueId(friendId);
        
        if (!user) {
            this.showToast('Пользователь не найден', true);
            return;
        }
        
        const friends = await this.db.getFriends(this.currentUser.email);
        const alreadyFriend = friends.some(f => f.uniqueId === friendId);
        
        if (alreadyFriend) {
            this.elSearchResult.innerHTML = `<div class="found-user"><span>👤 ${user.name}</span><span style="color:#ffaa00;">Уже в друзьях</span></div>`;
            return;
        }
        
        this.elSearchResult.innerHTML = `
            <div class="found-user">
                <div>
                    <div style="color:#fff;font-weight:600;">${user.name}</div>
                    <div style="color:rgba(255,255,255,0.5);font-size:0.8rem;">${user.email}</div>
                </div>
                <button class="add-friend-btn" id="confirmAddFriend">Добавить</button>
            </div>
        `;
        
        document.getElementById('confirmAddFriend').addEventListener('click', () => {
            this.confirmAddFriend(friendId);
        });
    }

    async confirmAddFriend(friendId) {
        const success = await this.db.addFriend(this.currentUser.email, friendId);
        
        if (success) {
            this.showToast('Друг добавлен');
            this.inputFriendId.value = '';
            this.elSearchResult.innerHTML = '';
            await this.updateCounts();
            if (this.modalMessages.classList.contains('show')) this.renderFriendsList();
        } else {
            this.showToast('Ошибка', true);
        }
    }

    async renderFriendsList() {
        const friends = await this.db.getFriends(this.currentUser.email);
        const query = this.elUserSearch ? this.elUserSearch.value.toLowerCase() : '';
        
        const filtered = friends.filter(f => f.name.toLowerCase().includes(query));
        
        if (filtered.length === 0) {
            this.elFriendsList.innerHTML = `<div style="text-align:center;padding:2rem;color:rgba(255,255,255,0.3);">${friends.length === 0 ? 'Нет друзей' : 'Ничего не найдено'}</div>`;
            return;
        }
        
        this.elFriendsList.innerHTML = filtered.map(f => {
            return `
                <div class="user-item ${this.selectedChat?.uniqueId === f.uniqueId ? 'active' : ''}" data-uid="${f.uniqueId}">
                    <div class="user-item-avatar">${f.avatar ? '<img src="' + f.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👤'}</div>
                    <div class="user-item-info">
                        <div class="user-item-name">${f.name}</div>
                    </div>
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

    async renderAllFriends() {
        const friends = await this.db.getFriends(this.currentUser.email);
        
        if (friends.length === 0) {
            this.elAllFriendsList.innerHTML = `<div style="text-align:center;padding:2rem;color:rgba(255,255,255,0.3);">У вас пока нет друзей</div>`;
            return;
        }
        
        this.elAllFriendsList.innerHTML = friends.map(f => `
            <div class="user-item" style="justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:1rem;">
                    <div class="user-item-avatar">${f.avatar ? '<img src="' + f.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👤'}</div>
                    <div>
                        <div style="color:#fff;font-weight:600;">${f.name}</div>
                        <div style="color:rgba(255,255,255,0.4);font-size:0.8rem;">ID: ${f.uniqueId}</div>
                    </div>
                </div>
                <button class="remove-friend-btn" data-uid="${f.uniqueId}">Удалить</button>
            </div>
        `).join('');
        
        this.elAllFriendsList.querySelectorAll('.remove-friend-btn').forEach(btn => {
            btn.addEventListener('click', () => this.removeFriend(btn.dataset.uid));
        });
    }

    async removeFriend(friendId) {
        if (confirm('Удалить из друзей?')) {
            await this.db.removeFriend(this.currentUser.email, friendId);
            if (this.selectedChat?.uniqueId === friendId) this.clearChat();
            await this.renderFriendsList();
            await this.renderAllFriends();
            await this.updateCounts();
            this.showToast('Друг удален');
        }
    }

    async selectChat(friendId) {
        const friends = await this.db.getFriends(this.currentUser.email);
        const friend = friends.find(f => f.uniqueId === friendId);
        if (!friend) return;
        
        if (this.messageUnsubscribe) {
            this.messageUnsubscribe();
            this.messageUnsubscribe = null;
        }
        
        this.selectedChat = friend;
        this.elChatUserName.textContent = friend.name;
        this.elChatStatus.textContent = 'Онлайн';
        this.inputMessage.disabled = false;
        this.btnSendMessage.disabled = false;
        this.btnDeleteChat.style.display = 'block';
        
        await this.msg.markAsRead(friend.uniqueId, this.currentUser.uniqueId);
        await this.renderChatHistory();
        
        this.messageUnsubscribe = this.msg.subscribeToMessages(this.currentUser.uniqueId, friend.uniqueId, (messages) => {
            this.renderChatHistoryStatic(messages);
        });
        
        this.renderFriendsList();
        this.updateCounts();
    }

    async renderChatHistory() {
        if (!this.selectedChat) return;
        const messages = await this.msg.getConversation(this.currentUser.uniqueId, this.selectedChat.uniqueId);
        this.renderChatHistoryStatic(messages);
    }

    renderChatHistoryStatic(messages) {
        if (!this.selectedChat) return;
        
        const wasAtBottom = this.isScrolledToBottom();
        
        if (messages.length === 0) {
            this.elChatMessages.innerHTML = `<div class="no-chat-selected"><div class="no-chat-icon">💬</div><p>Начните общение!</p></div>`;
            return;
        }
        
        this.elChatMessages.innerHTML = messages.map(m => {
            const isSent = m.from === this.currentUser.uniqueId;
            const time = new Date(m.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            
            return `
                <div class="message ${isSent ? 'sent' : 'received'} ${m.pinned ? 'pinned' : ''}" data-message-id="${m.id}">
                    <div class="message-avatar">${isSent ? (this.currentUser.avatar ? '<img src="' + this.currentUser.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👤') : (this.selectedChat.avatar ? '<img src="' + this.selectedChat.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👥')}</div>
                    <div>
                        <div class="message-content">${m.text || (m.image ? '📷 Изображение' : '')}</div>
                        <div class="message-time">${time} ${m.pinned ? '📌' : ''}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        if (wasAtBottom) {
            setTimeout(() => {
                this.elChatMessages.scrollTop = this.elChatMessages.scrollHeight;
            }, 50);
        }
    }

    isScrolledToBottom() {
        const element = this.elChatMessages;
        return Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 50;
    }

    async sendMessage() {
        const text = this.inputMessage.value.trim();
        if (!text || !this.selectedChat) return;
        
        await this.msg.send(this.currentUser.uniqueId, this.selectedChat.uniqueId, text);
        this.inputMessage.value = '';
        await this.renderChatHistory();
        this.renderFriendsList();
        this.updateCounts();
        setTimeout(() => {
            this.elChatMessages.scrollTop = this.elChatMessages.scrollHeight;
        }, 50);
    }

    async deleteCurrentChat() {
        if (!this.selectedChat) return;
        if (confirm('Удалить переписку?')) {
            await this.msg.deleteChat(this.currentUser.uniqueId, this.selectedChat.uniqueId);
            this.renderChatHistory();
            this.showToast('Чат очищен');
        }
    }

    clearChat() {
        if (this.messageUnsubscribe) {
            this.messageUnsubscribe();
            this.messageUnsubscribe = null;
        }
        this.selectedChat = null;
        this.elChatUserName.textContent = 'Выберите чат';
        this.elChatStatus.textContent = '';
        this.inputMessage.disabled = true;
        this.btnSendMessage.disabled = true;
        this.btnDeleteChat.style.display = 'none';
        this.elChatMessages.innerHTML = `<div class="no-chat-selected"><div class="no-chat-icon">💬</div><p>Выберите друга для начала общения</p></div>`;
    }

    startPolling() {
        setInterval(async () => {
            if (this.modalMessages && this.modalMessages.classList.contains('show')) {
                await this.updateCounts();
                await this.renderFriendsList();
            }
        }, 3000);
    }

    initContextMenu() {
        if (!this.elChatMessages) return;
        this.elChatMessages.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const messageDiv = e.target.closest('.message');
            if (!messageDiv) return;
            
            this.selectedMessageId = parseInt(messageDiv.dataset.messageId);
            this.contextMenu.style.display = 'block';
            this.contextMenu.style.left = e.pageX + 'px';
            this.contextMenu.style.top = e.pageY + 'px';
        });
    }

    hideContextMenu() {
        this.contextMenu.style.display = 'none';
    }

    deleteSelectedMessage() {
        this.hideContextMenu();
        this.showToast('Удаление временно недоступно');
    }

    pinSelectedMessage() {
        this.hideContextMenu();
        this.showToast('Закрепление временно недоступно');
    }

    unpinSelectedMessage() {
        this.hideContextMenu();
    }

    copyMessageText() {
        this.hideContextMenu();
        this.showToast('Копирование временно недоступно');
    }

    logout() {
        localStorage.removeItem('currentUser');
        window.location.replace('index.html');
    }
}

// ЗАПУСК
document.addEventListener('DOMContentLoaded', () => {
    new HomeApp();
});