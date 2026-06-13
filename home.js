// ============================================
// ГЛАВНОЕ ПРИЛОЖЕНИЕ SLICEMES
// ============================================

let currentUser = null;
let currentChat = null;
let messageUnsubscribe = null;
let isMobile = window.innerWidth <= 768;

// API ключ FreeImage.host
const FREEIMAGE_API_KEY = '6d207e02198a847aa98d0a2a901485a5';

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, isError = false) {
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

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'никогда';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds} сек назад`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
}

function formatLastSeen(timestamp) {
    if (!timestamp) return 'очень давно';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'только что';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} дн назад`;
    return new Date(timestamp).toLocaleDateString();
}

function waitForFirebase() {
    return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
            if (window.db) {
                clearInterval(checkInterval);
                console.log('Firebase готов');
                resolve();
            }
        }, 100);
    });
}

// ========== ФУНКЦИИ ЗАГРУЗКИ МЕДИА ==========

async function uploadToFreeImage(file) {
    const formData = new FormData();
    formData.append('source', file);
    formData.append('key', FREEIMAGE_API_KEY);
    
    try {
        const response = await fetch('https://freeimage.host/api/1/upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        
        if (result.status_code === 200) {
            return {
                url: result.image.url,
                thumb: result.image.thumb?.url || result.image.url
            };
        } else {
            throw new Error(result.error?.message || 'Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        return null;
    }
}

function getFileType(file) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'unknown';
}

function setupMediaPreview() {
    const fileInput = document.getElementById('postMediaFile');
    const preview = document.getElementById('mediaPreview');
    if (!fileInput) return;
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            preview.innerHTML = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            if (file.type.startsWith('image/')) {
                preview.innerHTML = `<img src="${event.target.result}" style="max-width:100%; max-height:150px; border-radius:8px;">`;
            } else if (file.type.startsWith('video/')) {
                preview.innerHTML = `<video src="${event.target.result}" controls style="max-width:100%; max-height:150px; border-radius:8px;"></video>`;
            }
        };
        reader.readAsDataURL(file);
    });
}

// ========== ПРОФИЛЬ ==========

async function loadCurrentUser() {
    const saved = localStorage.getItem('currentUser');
    if (!saved) {
        window.location.href = 'index.html';
        return;
    }
    currentUser = JSON.parse(saved);
    console.log('Пользователь:', currentUser.name);
    
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            currentUser.id = key;
            currentUser.friends = users[key].friends || [];
            currentUser.avatar = users[key].avatar;
            currentUser.bio = users[key].bio || '';
            currentUser.cover = users[key].cover;
            currentUser.lastIdChange = users[key].lastIdChange || 0;
            break;
        }
    }
    updateUserStatus();
}

function updateUserUI() {
    const userNameEl = document.getElementById('sidebarUserName');
    const userIdEl = document.getElementById('sidebarUserUniqueId');
    const profileNameEl = document.getElementById('profileNameInput');
    const profileEmailEl = document.getElementById('profileEmailInput');
    const profileIdEl = document.getElementById('profileIdInput');
    const profileBioEl = document.getElementById('profileBioInput');
    const lastIdChangeEl = document.getElementById('lastIdChange');
    const idChangeWarningEl = document.querySelector('.id-change-warning');
    
    if (!currentUser) return;
    
    if (userNameEl) userNameEl.textContent = currentUser.name || 'Пользователь';
    if (userIdEl) userIdEl.textContent = currentUser.uniqueId || 'ID...';
    if (profileNameEl) profileNameEl.value = currentUser.name || '';
    if (profileEmailEl) profileEmailEl.value = currentUser.email || '';
    if (profileIdEl) profileIdEl.value = currentUser.uniqueId || '';
    if (profileBioEl) profileBioEl.value = currentUser.bio || '';
    
    const hasChangedId = currentUser.lastIdChange && currentUser.lastIdChange > 0;
    
    if (hasChangedId) {
        const daysSinceLastChange = (Date.now() - currentUser.lastIdChange) / (1000 * 60 * 60 * 24);
        const canChangeAgain = daysSinceLastChange >= 7;
        
        if (canChangeAgain) {
            if (lastIdChangeEl) {
                lastIdChangeEl.textContent = '✅ Вы можете изменить ID';
                lastIdChangeEl.style.color = '#00ff88';
                lastIdChangeEl.style.display = 'block';
            }
            if (idChangeWarningEl) idChangeWarningEl.style.display = 'none';
        } else {
            const daysLeft = Math.ceil(7 - daysSinceLastChange);
            const hoursLeft = Math.ceil((7 - daysSinceLastChange) * 24);
            let timeText = daysLeft > 0 ? `${daysLeft} дн` : `${hoursLeft} ч`;
            if (lastIdChangeEl) {
                lastIdChangeEl.textContent = `⚠️ ID был изменен ${formatTimeAgo(currentUser.lastIdChange)}. Следующая смена через ${timeText}`;
                lastIdChangeEl.style.color = '#ffaa00';
                lastIdChangeEl.style.display = 'block';
            }
            if (idChangeWarningEl) idChangeWarningEl.style.display = 'none';
        }
    } else {
        if (lastIdChangeEl) lastIdChangeEl.style.display = 'none';
        if (idChangeWarningEl) idChangeWarningEl.style.display = 'none';
    }
    
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarAvatar) {
        if (currentUser.avatar) {
            sidebarAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        } else {
            sidebarAvatar.innerHTML = '👤';
        }
    }
    
    const profileAvatar = document.getElementById('profileAvatarLarge');
    if (profileAvatar) {
        if (currentUser.avatar) {
            profileAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
        } else {
            profileAvatar.innerHTML = '👤';
        }
    }
    
    const profileCover = document.getElementById('profileCover');
    if (profileCover) {
        if (currentUser.cover) {
            profileCover.style.backgroundImage = `url(${currentUser.cover})`;
            profileCover.style.backgroundSize = 'cover';
            profileCover.style.backgroundPosition = 'center';
        } else {
            profileCover.style.backgroundImage = 'linear-gradient(135deg, #1a1a1a, #0a0a0a)';
        }
    }
}

async function changeUserId() {
    const newId = document.getElementById('profileIdInput').value.trim().toUpperCase();
    if (!newId) {
        showToast('Введите новый ID', true);
        return;
    }
    
    if (newId === currentUser.uniqueId) {
        showToast('Это ваш текущий ID', true);
        return;
    }
    
    if (!/^ID[A-Z0-9]{8}$/.test(newId)) {
        showToast('ID должен быть формата IDXXXXXXXX (8 символов, буквы и цифры)', true);
        return;
    }
    
    const hasChangedBefore = currentUser.lastIdChange && currentUser.lastIdChange > 0;
    if (hasChangedBefore) {
        const daysSinceLastChange = (Date.now() - currentUser.lastIdChange) / (1000 * 60 * 60 * 24);
        if (daysSinceLastChange < 7) {
            const daysLeft = Math.ceil(7 - daysSinceLastChange);
            showToast(`ID можно изменить через ${daysLeft} дней`, true);
            return;
        }
    }
    
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    for (let key in users) {
        if (users[key].uniqueId === newId && users[key].email !== currentUser.email) {
            showToast('Этот ID уже занят', true);
            return;
        }
    }
    
    const oldId = currentUser.uniqueId;
    const now = Date.now();
    
    await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), {
        uniqueId: newId,
        lastIdChange: now
    });
    
    currentUser.uniqueId = newId;
    currentUser.lastIdChange = now;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    for (let key in users) {
        if (users[key].friends && users[key].friends.includes(oldId)) {
            const newFriends = users[key].friends.map(id => id === oldId ? newId : id);
            await firebaseUpdate(firebaseRef(db, 'users/' + key), { friends: newFriends });
        }
    }
    
    const messagesRef = firebaseRef(db, 'messages');
    const messagesSnapshot = await firebaseGet(messagesRef);
    const messages = messagesSnapshot.val();
    if (messages) {
        for (let chatId in messages) {
            let needUpdate = false;
            const updatedMessages = {};
            for (let msgKey in messages[chatId]) {
                const msg = messages[chatId][msgKey];
                if (msg.from === oldId) {
                    msg.from = newId;
                    needUpdate = true;
                }
                if (msg.to === oldId) {
                    msg.to = newId;
                    needUpdate = true;
                }
                updatedMessages[msgKey] = msg;
            }
            if (needUpdate) {
                await firebaseSet(firebaseRef(db, 'messages/' + chatId), updatedMessages);
            }
        }
    }
    
    showToast(`✅ ID изменен на ${newId}`);
    updateUserUI();
    document.getElementById('profileModal').classList.remove('show');
}

async function saveProfile() {
    const newName = document.getElementById('profileNameInput').value.trim();
    const newBio = document.getElementById('profileBioInput').value.trim();
    
    if (!newName) {
        showToast('Имя не может быть пустым', true);
        return;
    }
    
    await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), {
        name: newName,
        bio: newBio || ''
    });
    
    currentUser.name = newName;
    currentUser.bio = newBio;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateUserUI();
    showToast('Профиль обновлен');
    document.getElementById('profileModal').classList.remove('show');
}

async function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const avatarData = event.target.result;
            await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { avatar: avatarData });
            currentUser.avatar = avatarData;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateUserUI();
            showToast('Аватар обновлен');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

async function changeCover() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const coverData = event.target.result;
            
            await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { 
                cover: coverData 
            });
            
            currentUser.cover = coverData;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            const profileCover = document.getElementById('profileCover');
            if (profileCover) {
                profileCover.style.backgroundImage = `url(${coverData})`;
                profileCover.style.backgroundSize = 'cover';
                profileCover.style.backgroundPosition = 'center';
            }
            
            showToast('✅ Обложка обновлена!');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ========== ФУНКЦИИ ДЛЯ ЧАТОВ ==========

async function getLastMessage(friendId) {
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    const snapshot = await firebaseGet(messagesRef);
    const messages = snapshot.val();
    if (!messages) return null;
    
    const messagesArray = Object.values(messages).sort((a,b) => b.id - a.id);
    return messagesArray[0];
}

async function getUnreadCount(friendId) {
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    const snapshot = await firebaseGet(messagesRef);
    const messages = snapshot.val();
    if (!messages) return 0;
    
    let count = 0;
    for (let key in messages) {
        if (messages[key].to === currentUser.uniqueId && !messages[key].read) {
            count++;
        }
    }
    return count;
}

async function getUserStatus(friendId) {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    for (let key in users) {
        if (users[key].uniqueId === friendId) {
            const lastSeen = users[key].lastSeen || 0;
            const isOnline = (Date.now() - lastSeen) < 60000;
            return { isOnline, lastSeen };
        }
    }
    return { isOnline: false, lastSeen: 0 };
}

function updateUserStatus() {
    if (!currentUser || !currentUser.id) return;
    
    const userRef = firebaseRef(db, 'users/' + currentUser.id);
    firebaseUpdate(userRef, { lastSeen: Date.now() });
    
    if (window.statusInterval) clearInterval(window.statusInterval);
    window.statusInterval = setInterval(() => {
        if (currentUser && currentUser.id) {
            firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { lastSeen: Date.now() });
        }
    }, 30000);
}

window.addEventListener('beforeunload', () => {
    if (currentUser && currentUser.id) {
        firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { lastSeen: Date.now() });
    }
});

async function markMessagesAsRead(friendId) {
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    const snapshot = await firebaseGet(messagesRef);
    const messages = snapshot.val();
    
    if (messages) {
        for (let key in messages) {
            if (messages[key].to === currentUser.uniqueId && !messages[key].read) {
                await firebaseUpdate(firebaseRef(db, 'messages/' + chatId + '/' + key), { read: true });
            }
        }
    }
}

// ========== ПРОФИЛЬ ДРУГА ==========

async function showFriendProfile(friendId, friendName) {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    let friendData = null;
    for (let key in users) {
        if (users[key].uniqueId === friendId) {
            friendData = { ...users[key], id: key };
            break;
        }
    }
    
    if (!friendData) {
        showToast('Данные пользователя не найдены', true);
        return;
    }
    
    let modal = document.getElementById('friendProfileModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'friendProfileModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content friend-profile-modal">
                <button class="close-modal" id="closeFriendProfileModal">✕</button>
                <div class="friend-profile-header">
                    <div class="friend-profile-avatar" id="friendProfileAvatar">👤</div>
                    <div class="friend-profile-name" id="friendProfileName"></div>
                    <div class="friend-profile-id" id="friendProfileId"></div>
                </div>
                <div class="friend-profile-bio" id="friendProfileBio"></div>
                <div class="friend-profile-stats">
                    <div class="friend-profile-stat">
                        <div class="friend-profile-stat-value" id="friendMutualFriends">0</div>
                        <div class="friend-profile-stat-label">Общих друзей</div>
                    </div>
                </div>
                <button id="sendMessageToFriendBtn" class="submit-btn">💬 Написать сообщение</button>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('closeFriendProfileModal').onclick = () => {
            modal.classList.remove('show');
        };
        modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('show'); };
    }
    
    document.getElementById('friendProfileName').textContent = friendData.name;
    document.getElementById('friendProfileId').textContent = friendData.uniqueId;
    document.getElementById('friendProfileBio').textContent = friendData.bio || 'Пользователь ничего не рассказал о себе';
    
    const avatarEl = document.getElementById('friendProfileAvatar');
    if (friendData.avatar) {
        avatarEl.innerHTML = `<img src="${friendData.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else {
        avatarEl.innerHTML = '👤';
    }
    
    const currentUserFriends = currentUser.friends || [];
    const friendFriends = friendData.friends || [];
    const mutualFriends = currentUserFriends.filter(id => friendFriends.includes(id));
    document.getElementById('friendMutualFriends').textContent = mutualFriends.length;
    
    document.getElementById('sendMessageToFriendBtn').onclick = () => {
        modal.classList.remove('show');
        handleChatClick(friendId, friendData.name);
        document.querySelector('.nav-item[data-page="chats"]').click();
    };
    
    modal.classList.add('show');
}

window.showFriendProfile = showFriendProfile;

async function showFriendProfileFromChat() {
    if (!currentChat) return;
    await showFriendProfile(currentChat.id, currentChat.name);
}

// ========== ЗАГРУЗКА ДРУЗЕЙ ==========

async function loadFriends() {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    if (!users) return;
    
    let currentUserData = null;
    for (let key in users) {
        if (users[key].email === currentUser.email) {
            currentUserData = users[key];
            currentUser.id = key;
            currentUser.friends = users[key].friends || [];
            break;
        }
    }
    
    if (!currentUserData) return;
    
    const friendsIds = currentUserData.friends || [];
    const friendsList = [];
    for (let friendId of friendsIds) {
        for (let key in users) {
            if (users[key].uniqueId === friendId) {
                friendsList.push({
                    id: key,
                    name: users[key].name,
                    email: users[key].email,
                    uniqueId: users[key].uniqueId,
                    avatar: users[key].avatar,
                    bio: users[key].bio
                });
                break;
            }
        }
    }
    
    renderFriends(friendsList);
    renderChats(friendsList);
}

function renderFriends(friends) {
    const container = document.getElementById('friendsGrid');
    if (!friends.length) {
        container.innerHTML = '<div class="empty-state">У вас пока нет друзей<br><br>👉 Нажмите "➕ Добавить друга" чтобы найти друзей по ID</div>';
        return;
    }
    
    container.innerHTML = friends.map(friend => `
        <div class="friend-card" data-id="${friend.uniqueId}">
            <div class="friend-avatar" onclick="window.showFriendProfile('${friend.uniqueId}', '${escapeHtml(friend.name)}')" style="cursor:pointer">${friend.avatar ? `<img src="${friend.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
            <div class="friend-info" onclick="window.showFriendProfile('${friend.uniqueId}', '${escapeHtml(friend.name)}')" style="cursor:pointer">
                <div class="friend-name">${escapeHtml(friend.name)}</div>
                <div class="friend-id">${friend.uniqueId}</div>
            </div>
            <div class="friend-actions">
                <button class="friend-msg-btn" data-id="${friend.uniqueId}" data-name="${escapeHtml(friend.name)}">💬</button>
                <button class="friend-remove-btn" data-id="${friend.uniqueId}">✕</button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.friend-msg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            handleChatClick(friendId, friendName);
            document.querySelector('.nav-item[data-page="chats"]').click();
        });
    });
    
    document.querySelectorAll('.friend-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const friendId = btn.dataset.id;
            if (confirm('Удалить друга?')) {
                await removeFriend(friendId);
            }
        });
    });
}

async function removeFriend(friendId) {
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    let friendUserKey = null;
    for (let key in users) {
        if (users[key].uniqueId === friendId) {
            friendUserKey = key;
            break;
        }
    }
    
    if (currentUser.id && friendUserKey) {
        let currentFriends = currentUser.friends || [];
        currentFriends = currentFriends.filter(id => id !== friendId);
        await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { friends: currentFriends });
        currentUser.friends = currentFriends;
        
        let friendFriends = users[friendUserKey].friends || [];
        friendFriends = friendFriends.filter(id => id !== currentUser.uniqueId);
        await firebaseUpdate(firebaseRef(db, 'users/' + friendUserKey), { friends: friendFriends });
        
        showToast('Друг удален');
        await loadFriends();
        
        if (currentChat && currentChat.id === friendId) {
            document.getElementById('chatMessagesArea').innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><p>Чат закрыт</p></div>';
            document.getElementById('chatAreaHeader').style.display = 'none';
            document.getElementById('chatInputArea').style.display = 'none';
            currentChat = null;
            if (messageUnsubscribe) {
                messageUnsubscribe();
                messageUnsubscribe = null;
            }
        }
    }
}

// ========== ПОИСК И ДОБАВЛЕНИЕ ДРУГА ==========

async function searchAndAddFriend() {
    const friendId = document.getElementById('friendIdInput').value.trim().toUpperCase();
    if (!friendId) {
        showToast('Введите ID друга', true);
        return;
    }
    
    if (friendId === currentUser.uniqueId) {
        showToast('Нельзя добавить самого себя', true);
        return;
    }
    
    const usersRef = firebaseRef(db, 'users');
    const snapshot = await firebaseGet(usersRef);
    const users = snapshot.val();
    
    let foundUser = null;
    let foundUserKey = null;
    for (let key in users) {
        if (users[key].uniqueId === friendId) {
            foundUser = { ...users[key], id: key };
            foundUserKey = key;
            break;
        }
    }
    
    if (!foundUser) {
        showToast('Пользователь не найден', true);
        return;
    }
    
    const currentFriends = currentUser.friends || [];
    if (currentFriends.includes(friendId)) {
        showToast('Этот пользователь уже в друзьях', true);
        return;
    }
    
    const resultDiv = document.getElementById('searchResultModal');
    resultDiv.innerHTML = `
        <div class="found-user">
            <div>
                <div style="font-weight:600;">${escapeHtml(foundUser.name)}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.5);">${foundUser.email}</div>
            </div>
            <button class="add-friend-btn" id="confirmAddFriendBtn">Добавить</button>
        </div>
    `;
    
    document.getElementById('confirmAddFriendBtn').onclick = async () => {
        let updatedFriends = currentFriends;
        updatedFriends.push(friendId);
        await firebaseUpdate(firebaseRef(db, 'users/' + currentUser.id), { friends: updatedFriends });
        currentUser.friends = updatedFriends;
        
        let friendFriends = users[foundUserKey].friends || [];
        if (!friendFriends.includes(currentUser.uniqueId)) {
            friendFriends.push(currentUser.uniqueId);
            await firebaseUpdate(firebaseRef(db, 'users/' + foundUserKey), { friends: friendFriends });
        }
        
        showToast(`✅ ${foundUser.name} добавлен в друзья!`);
        document.getElementById('addFriendModal').classList.remove('show');
        document.getElementById('friendIdInput').value = '';
        resultDiv.innerHTML = '';
        await loadFriends();
    };
}

// ========== ЧАТЫ И СООБЩЕНИЯ ==========

function clearChatUI() {
    const messagesContainer = document.getElementById('chatMessagesArea');
    if (messagesContainer) {
        messagesContainer.innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><p>Загрузка...</p></div>';
    }
    
    const nameEl = document.getElementById('chatContactName');
    if (nameEl) nameEl.textContent = 'Загрузка...';
    
    const statusEl = document.getElementById('chatContactStatus');
    if (statusEl) statusEl.innerHTML = '';
    
    const avatarContainer = document.querySelector('.chat-contact-avatar');
    if (avatarContainer) {
        const dot = avatarContainer.querySelector('.online-dot, .offline-dot');
        if (dot) dot.remove();
    }
}

async function openChat(friendId, friendName) {
    clearChatUI();
    
    if (messageUnsubscribe) {
        messageUnsubscribe();
        messageUnsubscribe = null;
    }
    
    currentChat = { id: friendId, name: friendName };
    
    await markMessagesAsRead(friendId);
    
    const backBtn = document.getElementById('backButton');
    if (backBtn) {
        backBtn.style.display = isMobile ? 'flex' : 'none';
        backBtn.onclick = () => {
            if (isMobile) closeChatMobile();
        };
    }
    
    const nameEl = document.getElementById('chatContactName');
    if (nameEl) nameEl.textContent = friendName;
    
    const status = await getUserStatus(friendId);
    const statusEl = document.getElementById('chatContactStatus');
    const avatarContainer = document.querySelector('.chat-contact-avatar');
    
    const oldDot = avatarContainer?.querySelector('.online-dot, .offline-dot');
    if (oldDot) oldDot.remove();
    
    if (status.isOnline) {
        if (statusEl) {
            statusEl.innerHTML = 'В сети';
            statusEl.style.color = '#00ff88';
        }
        if (avatarContainer) {
            const dot = document.createElement('div');
            dot.className = 'online-dot';
            avatarContainer.appendChild(dot);
        }
    } else {
        const lastSeenText = formatLastSeen(status.lastSeen);
        if (statusEl) {
            statusEl.innerHTML = `Был(а) ${lastSeenText}`;
            statusEl.style.color = 'rgba(255,255,255,0.5)';
        }
        if (avatarContainer) {
            const dot = document.createElement('div');
            dot.className = 'offline-dot';
            avatarContainer.appendChild(dot);
        }
    }
    
    document.getElementById('chatAreaHeader').style.display = 'flex';
    document.getElementById('chatInputArea').style.display = 'flex';
    
    const chatAvatar = document.querySelector('.chat-contact-avatar');
    if (chatAvatar) {
        chatAvatar.style.cursor = 'pointer';
        chatAvatar.onclick = () => showFriendProfileFromChat();
    }
    
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    
    messageUnsubscribe = firebaseOnValue(messagesRef, (snapshot) => {
        const messages = snapshot.val();
        renderMessages(messages ? Object.values(messages).sort((a,b) => a.id - b.id) : []);
        loadFriends();
    });
}

function renderMessages(messages) {
    const container = document.getElementById('chatMessagesArea');
    
    if (!messages.length) {
        container.innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><p>Начните общение!</p></div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isSent = msg.from === currentUser.uniqueId;
        const time = new Date(msg.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        let statusIcon = '';
        if (isSent) {
            statusIcon = msg.read ? 
                '<span class="message-status read">✓✓</span>' : 
                '<span class="message-status sent">✓</span>';
        }
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-avatar">${isSent ? (currentUser.avatar ? '<img src="' + currentUser.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👤') : (currentChat?.avatar ? '<img src="' + currentChat.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover">' : '👥')}</div>
                <div class="message-bubble">
                    <div class="message-content">${escapeHtml(msg.text)}</div>
                    <div class="message-footer">
                        <span class="message-time">${time}</span>
                        ${statusIcon}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !currentChat) return;
    
    const chatId = [currentUser.uniqueId, currentChat.id].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    const newMsgRef = firebasePush(messagesRef);
    
    await firebaseSet(newMsgRef, {
        id: Date.now(),
        from: currentUser.uniqueId,
        to: currentChat.id,
        text: text,
        time: new Date().toISOString(),
        read: false
    });
    
    input.value = '';
}

// ========== ЛЕНТА ==========

async function createPost() {
    const content = document.getElementById('postContent').value.trim();
    const mediaFile = document.getElementById('postMediaFile').files[0];
    
    if (!content && !mediaFile) {
        showToast('Введите текст или прикрепите фото/видео', true);
        return;
    }
    
    showToast('Публикация...');
    
    let mediaUrl = null;
    let mediaType = null;
    
    if (mediaFile) {
        const uploaded = await uploadToFreeImage(mediaFile);
        if (uploaded) {
            mediaUrl = uploaded.url;
            mediaType = getFileType(mediaFile);
        } else {
            showToast('Ошибка загрузки медиа', true);
            return;
        }
    }
    
    const postsRef = firebaseRef(db, 'posts');
    const newPostRef = firebasePush(postsRef);
    
    await firebaseSet(newPostRef, {
        id: Date.now(),
        authorId: currentUser.uniqueId,
        authorName: currentUser.name,
        authorAvatar: currentUser.avatar || null,
        content: content,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        time: new Date().toISOString(),
        likes: 0,
        comments: []
    });
    
    showToast('✅ Пост опубликован!');
    document.getElementById('createPostModal').classList.remove('show');
    document.getElementById('postContent').value = '';
    document.getElementById('postMediaFile').value = '';
    document.getElementById('mediaPreview').innerHTML = '';
    await loadFeed();
}

async function loadFeed() {
    const postsRef = firebaseRef(db, 'posts');
    const snapshot = await firebaseGet(postsRef);
    const posts = snapshot.val();
    
    const container = document.getElementById('feedPosts');
    if (!posts) {
        container.innerHTML = '<div class="empty-state">Нет постов</div>';
        return;
    }
    
    const postsArray = Object.values(posts).sort((a,b) => b.id - a.id);
    container.innerHTML = postsArray.map(post => `
        <div class="post-card">
            <div class="post-header">
                <div class="post-avatar" onclick="window.showFriendProfile('${post.authorId}', '${escapeHtml(post.authorName)}')" style="cursor:pointer">${post.authorAvatar ? `<img src="${post.authorAvatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
                <div onclick="window.showFriendProfile('${post.authorId}', '${escapeHtml(post.authorName)}')" style="cursor:pointer">
                    <div class="post-author">${escapeHtml(post.authorName)}</div>
                    <div class="post-time">${new Date(post.time).toLocaleString()}</div>
                </div>
            </div>
            <div class="post-content">${escapeHtml(post.content)}</div>
            ${post.mediaUrl ? `
                <div class="post-media">
                    ${post.mediaType === 'image' ? 
                        `<img src="${post.mediaUrl}" class="post-image" onclick="window.open(this.src)" style="max-width:100%; border-radius:12px; margin-top:10px; cursor:pointer">` : 
                        `<video src="${post.mediaUrl}" controls style="max-width:100%; border-radius:12px; margin-top:10px"></video>`
                    }
                </div>
            ` : ''}
            <div class="post-actions">
                <button class="post-like-btn" data-id="${post.id}">❤️ ${post.likes || 0}</button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.post-like-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = btn.dataset.id;
            await likePost(postId);
        });
    });
}

async function likePost(postId) {
    const postsRef = firebaseRef(db, 'posts');
    const snapshot = await firebaseGet(postsRef);
    const posts = snapshot.val();
    
    for (let key in posts) {
        if (posts[key].id == postId) {
            const currentLikes = posts[key].likes || 0;
            await firebaseUpdate(firebaseRef(db, 'posts/' + key), { likes: currentLikes + 1 });
            showToast('❤️ Лайк поставлен!');
            await loadFeed();
            break;
        }
    }
}



// ========== НАВИГАЦИЯ ==========

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const pages = document.querySelectorAll('.page');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(`${pageName}Page`).classList.add('active');
            
            if (pageName === 'feed') loadFeed();
            if (pageName === 'settings') updateSettingsUI();
        });
    });
}

function setupEventListeners() {
    // Выход
    document.getElementById('logoutBtnSidebar').onclick = () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    };
    
    // Профиль
    document.getElementById('openProfileBtn').onclick = async () => {
        await loadCurrentUser();
        updateUserUI();
        document.getElementById('profileModal').classList.add('show');
    };
    document.getElementById('closeProfileModal').onclick = () => {
        document.getElementById('profileModal').classList.remove('show');
    };
    document.getElementById('saveProfileChangesBtn').onclick = saveProfile;
    document.getElementById('changeAvatarBtn').onclick = changeAvatar;
    document.getElementById('changeCoverBtn').onclick = changeCover;
    document.getElementById('changeIdBtn').onclick = changeUserId;
    
    // Добавление друга
    document.getElementById('addFriendHeaderBtn').onclick = () => {
        document.getElementById('addFriendModal').classList.add('show');
    };
    document.getElementById('closeAddFriendModal').onclick = () => {
        document.getElementById('addFriendModal').classList.remove('show');
        document.getElementById('friendIdInput').value = '';
        document.getElementById('searchResultModal').innerHTML = '';
    };
    document.getElementById('searchFriendBtnModal').onclick = searchAndAddFriend;
    
    // Сообщения
    document.getElementById('sendMessageBtn').onclick = sendMessage;
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Посты
    document.getElementById('createPostBtn').onclick = () => {
        document.getElementById('createPostModal').classList.add('show');
    };
    document.getElementById('closePostModal').onclick = () => {
        document.getElementById('createPostModal').classList.remove('show');
        document.getElementById('postContent').value = '';
        document.getElementById('postMediaFile').value = '';
        document.getElementById('mediaPreview').innerHTML = '';
    };
    document.getElementById('publishPostBtn').onclick = createPost;
    
    // Кнопка выбора файла
    const fileUploadBtn = document.getElementById('fileUploadBtn');
    if (fileUploadBtn) {
        fileUploadBtn.onclick = () => {
            document.getElementById('postMediaFile').click();
        };
    }
    
    // ===== ИГРА 2048 =====
    document.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => {
            const game = card.dataset.game;
            if (game === '2048') {
                game2048OpenModal();
            } else {
                showToast('Игра в разработке');
            }
        });
    });
    
    document.getElementById('closeGame2048Modal').onclick = () => {
        document.getElementById('game2048Modal').classList.remove('show');
        document.body.classList.remove('game2048-modal-open');
        const metaViewport = document.querySelector('meta[name="viewport"]');
        if (metaViewport) {
            metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes');
        }
    };
    
    document.getElementById('game2048-newgame').onclick = () => {
        game2048NewGame();
    };
    
    // Клавиатура для 2048
    document.addEventListener('keydown', game2048HandleKey);
    
    // Свайпы для 2048
    const gameContainer = document.querySelector('.game2048-container');
    if (gameContainer) {
        gameContainer.addEventListener('touchstart', game2048HandleTouchStart);
        gameContainer.addEventListener('touchend', game2048HandleTouchEnd);
    }
    
    // Закрытие модалок по фону
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('show');
        };
    });
    
    // Предпросмотр медиа
    setupMediaPreview();
    
    // Поиск
    const friendsSearch = document.getElementById('friendsSearch');
    if (friendsSearch) {
        friendsSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.friend-card').forEach(card => {
                const name = card.querySelector('.friend-name')?.textContent.toLowerCase() || '';
                card.style.display = name.includes(query) ? 'flex' : 'none';
            });
        });
    }
    
    const chatsSearch = document.getElementById('chatsSearch');
    if (chatsSearch) {
        chatsSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.chat-item').forEach(item => {
                const name = item.querySelector('.chat-item-name')?.textContent.toLowerCase() || '';
                item.style.display = name.includes(query) ? 'flex' : 'none';
            });
        });
    }
}
// ========== МОБИЛЬНАЯ НАВИГАЦИЯ ==========

function checkMobile() {
    isMobile = window.innerWidth <= 768;
    return isMobile;
}

async function openChatMobile(friendId, friendName) {
    if (!isMobile) {
        openChat(friendId, friendName);
        return;
    }
    
    clearChatUI();
    
    if (messageUnsubscribe) {
        messageUnsubscribe();
        messageUnsubscribe = null;
    }
    
    currentChat = { id: friendId, name: friendName };
    
    await markMessagesAsRead(friendId);
    
    const backBtn = document.getElementById('backButton');
    if (backBtn) {
        backBtn.style.display = 'flex';
        backBtn.onclick = closeChatMobile;
    }
    
    const chatsSidebar = document.querySelector('.chats-sidebar');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsSidebar) chatsSidebar.style.display = 'none';
    if (chatArea) {
        chatArea.classList.add('active');
        chatArea.style.display = 'flex';
    }
    
    const nameEl = document.getElementById('chatContactName');
    if (nameEl) nameEl.textContent = friendName;
    
    const status = await getUserStatus(friendId);
    const statusEl = document.getElementById('chatContactStatus');
    const avatarContainer = document.querySelector('.chat-contact-avatar');
    
    const oldDot = avatarContainer?.querySelector('.online-dot, .offline-dot');
    if (oldDot) oldDot.remove();
    
    if (status.isOnline) {
        if (statusEl) {
            statusEl.innerHTML = 'В сети';
            statusEl.style.color = '#00ff88';
        }
        if (avatarContainer) {
            const dot = document.createElement('div');
            dot.className = 'online-dot';
            avatarContainer.appendChild(dot);
        }
    } else {
        const lastSeenText = formatLastSeen(status.lastSeen);
        if (statusEl) {
            statusEl.innerHTML = `Был(а) ${lastSeenText}`;
            statusEl.style.color = 'rgba(255,255,255,0.5)';
        }
        if (avatarContainer) {
            const dot = document.createElement('div');
            dot.className = 'offline-dot';
            avatarContainer.appendChild(dot);
        }
    }
    
    document.getElementById('chatAreaHeader').style.display = 'flex';
    document.getElementById('chatInputArea').style.display = 'flex';
    
    const chatAvatar = document.querySelector('.chat-contact-avatar');
    if (chatAvatar) {
        chatAvatar.style.cursor = 'pointer';
        chatAvatar.onclick = () => showFriendProfileFromChat();
    }
    
    const chatId = [currentUser.uniqueId, friendId].sort().join('___');
    const messagesRef = firebaseRef(db, 'messages/' + chatId);
    
    messageUnsubscribe = firebaseOnValue(messagesRef, (snapshot) => {
        const messages = snapshot.val();
        renderMessages(messages ? Object.values(messages).sort((a,b) => a.id - b.id) : []);
        loadFriends();
    });
}

function closeChatMobile() {
    const chatsSidebar = document.querySelector('.chats-sidebar');
    const chatArea = document.querySelector('.chat-area');
    
    if (chatsSidebar) chatsSidebar.style.display = 'flex';
    if (chatArea) {
        chatArea.classList.remove('active');
        chatArea.style.display = 'none';
    }
    
    if (messageUnsubscribe) {
        messageUnsubscribe();
        messageUnsubscribe = null;
    }
    
    currentChat = null;
    
    const messagesContainer = document.getElementById('chatMessagesArea');
    if (messagesContainer) {
        messagesContainer.innerHTML = '<div class="empty-chat"><div class="empty-chat-icon">💬</div><p>Выберите чат для начала общения</p></div>';
    }
    
    setTimeout(async () => {
        await loadFriends();
    }, 100);
}

function handleChatClick(friendId, friendName) {
    if (isMobile) {
        openChatMobile(friendId, friendName);
    } else {
        openChat(friendId, friendName);
    }
}

async function renderChats(friends) {
    const container = document.getElementById('chatsList');
    
    if (!friends || friends.length === 0) {
        container.innerHTML = '<div class="empty-state">Нет чатов<br><br>👉 Добавьте друзей чтобы начать общение</div>';
        return;
    }
    
    const chatsData = await Promise.all(friends.map(async (friend) => {
        const lastMsg = await getLastMessage(friend.uniqueId);
        const unreadCount = await getUnreadCount(friend.uniqueId);
        const status = await getUserStatus(friend.uniqueId);
        
        let lastMsgText = 'Нет сообщений';
        let lastMsgTime = '';
        
        if (lastMsg) {
            lastMsgText = lastMsg.text ? 
                (lastMsg.text.length > 30 ? lastMsg.text.substring(0, 27) + '...' : lastMsg.text) : 
                '📷 Изображение';
            const msgDate = new Date(lastMsg.time);
            const now = new Date();
            if (msgDate.toDateString() === now.toDateString()) {
                lastMsgTime = msgDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            } else {
                lastMsgTime = msgDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            }
        }
        
        let statusText = '';
        let statusColor = '';
        
        if (status.isOnline) {
            statusText = 'онлайн';
            statusColor = '#00ff88';
        } else if (status.lastSeen) {
            const diffMins = Math.floor((Date.now() - status.lastSeen) / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);
            
            if (diffMins < 60) {
                statusText = `был(а) ${diffMins} мин назад`;
            } else if (diffHours < 24) {
                statusText = `был(а) ${diffHours} ч назад`;
            } else {
                statusText = `был(а) ${diffDays} дн назад`;
            }
            statusColor = 'rgba(255,255,255,0.4)';
        } else {
            statusText = 'был(а) давно';
            statusColor = 'rgba(255,255,255,0.3)';
        }
        
        return {
            ...friend,
            lastMsgText,
            lastMsgTime,
            unreadCount,
            statusText,
            statusColor
        };
    }));
    
    container.innerHTML = chatsData.map(chat => `
        <div class="chat-item" data-id="${chat.uniqueId}" data-name="${escapeHtml(chat.name)}">
            <div class="chat-item-avatar">${chat.avatar ? `<img src="${chat.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : '👤'}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${escapeHtml(chat.name)}</div>
                <div class="chat-item-lastmsg">
                    <span class="last-msg-text">${escapeHtml(chat.lastMsgText)}</span>
                    <span class="last-msg-time">${chat.lastMsgTime}</span>
                </div>
                <div class="chat-item-status" style="color: ${chat.statusColor}">● ${chat.statusText}</div>
            </div>
            ${chat.unreadCount > 0 ? `<span class="chat-item-badge">${chat.unreadCount}</span>` : ''}
        </div>
    `).join('');
    
    document.querySelectorAll('.chat-item').forEach(item => {
        item.addEventListener('click', async () => {
            const friendId = item.dataset.id;
            const friendName = item.dataset.name;
            await markMessagesAsRead(friendId);
            handleChatClick(friendId, friendName);
        });
    });
}

// ===== МОБИЛЬНОЕ МЕНЮ =====
function setupMobileNav() {
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    const pages = document.querySelectorAll('.page');
    
    if (!mobileNavItems.length) return;
    
    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            
            mobileNavItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            pages.forEach(page => page.classList.remove('active'));
            
            if (pageName === 'profile') {
                document.getElementById('profileModal').classList.add('show');
                const activePage = document.querySelector('.page.active');
                if (activePage) activePage.classList.add('active');
                mobileNavItems.forEach(nav => nav.classList.remove('active'));
                const prevActive = document.querySelector(`.mobile-nav-item[data-page="${activePage?.id?.replace('Page', '')}"]`);
                if (prevActive) prevActive.classList.add('active');
            } else {
                const targetPage = document.getElementById(`${pageName}Page`);
                if (targetPage) targetPage.classList.add('active');
            }
            
            if (pageName === 'feed') loadFeed();
        });
    });
}

// ========== УПРАВЛЕНИЕ ТЕМАМИ ==========

function loadTheme() {
    const savedTheme = localStorage.getItem('appTheme') || 'dark';
    applyTheme(savedTheme);
    
    const themeNames = {
        dark: '🌙 Тёмная',
        light: '☀️ Светлая',
        red: '🔴 Красная',
        green: '🟢 Зелёная',
        pink: '🌸 Розовая',
        yellow: '🟡 Жёлтая',
        blue: '💙 Голубая'
    };
    
    const currentThemeName = document.getElementById('currentThemeName');
    if (currentThemeName) {
        currentThemeName.textContent = themeNames[savedTheme] || '🌙 Тёмная';
    }
    
    document.querySelectorAll('.theme-option').forEach(btn => {
        if (btn.dataset.theme === savedTheme) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-red', 'theme-green', 'theme-pink', 'theme-yellow', 'theme-blue');
    root.classList.add(`theme-${theme}`);
    localStorage.setItem('appTheme', theme);
}

function setupThemeDropdown() {
    const themeBtn = document.getElementById('themeSelectBtn');
    const themeDropdown = document.getElementById('themeDropdown');
    const currentThemeName = document.getElementById('currentThemeName');
    
    if (!themeBtn) return;
    
    themeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = themeDropdown.style.display === 'block';
        themeDropdown.style.display = isOpen ? 'none' : 'block';
        themeBtn.classList.toggle('active', !isOpen);
    });
    
    document.addEventListener('click', () => {
        themeDropdown.style.display = 'none';
        themeBtn.classList.remove('active');
    });
    
    document.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = btn.dataset.theme;
            const themeName = btn.textContent;
            
            applyTheme(theme);
            if (currentThemeName) currentThemeName.textContent = themeName;
            themeDropdown.style.display = 'none';
            themeBtn.classList.remove('active');
            
            document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            showToast(`Тема изменена на ${themeName}`);
        });
    });
}

// ========== ИГРА 2048 ==========

let game2048Board = [];
let game2048Score = 0;
let game2048Best = localStorage.getItem('game2048Best') || 0;
let game2048Animating = false;

function game2048Init() {
    game2048Board = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ];
    game2048Score = 0;
    game2048Animating = false;
    window.game2048WinShown = false;
    window.lastNotifiedValue = 0;
    
    game2048CreateBoardUI();
    game2048AddRandomTile();
    game2048AddRandomTile();
    game2048UpdateUI();
}

function game2048NewGame() {
    if (game2048Animating) return;
    window.game2048WinShown = false;
    window.lastNotifiedValue = 0;
    game2048Init();
}

function game2048OpenModal() {
    window.game2048WinShown = false;
    window.lastNotifiedValue = 0;
    game2048Init();
    document.getElementById('game2048Modal').classList.add('show');
    document.body.classList.add('game2048-modal-open');
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
}

function game2048CreateBoardUI() {
    const boardElement = document.getElementById('game2048-board');
    if (!boardElement) return;
    
    boardElement.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const cell = document.createElement('div');
            cell.className = 'game2048-cell';
            cell.id = `cell_${i}_${j}`;
            boardElement.appendChild(cell);
        }
    }
    game2048UpdateBoardUI();
}

function game2048UpdateBoardUI() {
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const cell = document.getElementById(`cell_${i}_${j}`);
            const value = game2048Board[i][j];
            const oldValue = parseInt(cell.getAttribute('data-value') || '0');
            
            if (value === 0) {
                cell.textContent = '';
                cell.removeAttribute('data-value');
            } else {
                cell.textContent = value;
                cell.setAttribute('data-value', value);
                
                // Анимация для новых плиток
                if (oldValue === 0) {
                    cell.classList.remove('merge');
                    cell.classList.add('new');
                    setTimeout(() => cell.classList.remove('new'), 200);
                }
                // Анимация для слияния
                else if (oldValue !== value && value === oldValue * 2) {
                    cell.classList.remove('new');
                    cell.classList.add('merge');
                    setTimeout(() => cell.classList.remove('merge'), 200);
                }
            }
        }
    }
}

function game2048UpdateUI() {
    document.getElementById('game2048-score').textContent = game2048Score;
    
    if (game2048Score > game2048Best) {
        game2048Best = game2048Score;
        localStorage.setItem('game2048Best', game2048Best);
    }
    document.getElementById('game2048-best').textContent = game2048Best;
}

function game2048AddRandomTile() {
    let emptyCells = [];
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if (game2048Board[i][j] === 0) {
                emptyCells.push({x: i, y: j});
            }
        }
    }
    
    if (emptyCells.length > 0) {
        let randomCell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
        game2048Board[randomCell.x][randomCell.y] = Math.random() < 0.9 ? 2 : 4;
        game2048UpdateBoardUI();
    }
}

async function game2048Move(direction) {
    if (game2048Animating) return;
    game2048Animating = true;
    
    let oldBoard = JSON.parse(JSON.stringify(game2048Board));
    let addedScore = 0;
    
    // Создаём новую доску
    let newBoard = JSON.parse(JSON.stringify(game2048Board));
    
    // Определяем порядок обработки
    let rows = [0, 1, 2, 3];
    let cols = [0, 1, 2, 3];
    
    if (direction === 'right') cols = [3, 2, 1, 0];
    if (direction === 'down') rows = [3, 2, 1, 0];
    
    // Анимация перемещения - добавляем класс moving
    for (let i of rows) {
        for (let j of cols) {
            if (oldBoard[i][j] !== 0) {
                const cell = document.getElementById(`cell_${i}_${j}`);
                if (cell) {
                    cell.classList.add('moving');
                    setTimeout(() => cell.classList.remove('moving'), 100);
                }
            }
        }
    }
    
    await new Promise(r => setTimeout(r, 50));
    
    for (let i of rows) {
        for (let j of cols) {
            if (newBoard[i][j] !== 0) {
                let value = newBoard[i][j];
                let targetRow = i, targetCol = j;
                
                if (direction === 'left') {
                    for (let k = j - 1; k >= 0; k--) {
                        if (newBoard[i][k] === 0) {
                            targetCol = k;
                        } else if (newBoard[i][k] === value) {
                            targetCol = k;
                            break;
                        } else break;
                    }
                    if (targetCol !== j) {
                        if (newBoard[i][targetCol] === value) {
                            newBoard[i][targetCol] = value * 2;
                            addedScore += value * 2;
                            newBoard[i][j] = 0;
                        } else if (newBoard[i][targetCol] === 0) {
                            newBoard[i][targetCol] = value;
                            newBoard[i][j] = 0;
                        }
                    }
                }
                else if (direction === 'right') {
                    for (let k = j + 1; k < 4; k++) {
                        if (newBoard[i][k] === 0) {
                            targetCol = k;
                        } else if (newBoard[i][k] === value) {
                            targetCol = k;
                            break;
                        } else break;
                    }
                    if (targetCol !== j) {
                        if (newBoard[i][targetCol] === value) {
                            newBoard[i][targetCol] = value * 2;
                            addedScore += value * 2;
                            newBoard[i][j] = 0;
                        } else if (newBoard[i][targetCol] === 0) {
                            newBoard[i][targetCol] = value;
                            newBoard[i][j] = 0;
                        }
                    }
                }
                else if (direction === 'up') {
                    for (let k = i - 1; k >= 0; k--) {
                        if (newBoard[k][j] === 0) {
                            targetRow = k;
                        } else if (newBoard[k][j] === value) {
                            targetRow = k;
                            break;
                        } else break;
                    }
                    if (targetRow !== i) {
                        if (newBoard[targetRow][j] === value) {
                            newBoard[targetRow][j] = value * 2;
                            addedScore += value * 2;
                            newBoard[i][j] = 0;
                        } else if (newBoard[targetRow][j] === 0) {
                            newBoard[targetRow][j] = value;
                            newBoard[i][j] = 0;
                        }
                    }
                }
                else if (direction === 'down') {
                    for (let k = i + 1; k < 4; k++) {
                        if (newBoard[k][j] === 0) {
                            targetRow = k;
                        } else if (newBoard[k][j] === value) {
                            targetRow = k;
                            break;
                        } else break;
                    }
                    if (targetRow !== i) {
                        if (newBoard[targetRow][j] === value) {
                            newBoard[targetRow][j] = value * 2;
                            addedScore += value * 2;
                            newBoard[i][j] = 0;
                        } else if (newBoard[targetRow][j] === 0) {
                            newBoard[targetRow][j] = value;
                            newBoard[i][j] = 0;
                        }
                    }
                }
            }
        }
    }
    
    // Проверяем, изменилась ли доска
    if (JSON.stringify(oldBoard) !== JSON.stringify(newBoard)) {
        game2048Board = newBoard;
        game2048Score += addedScore;
        game2048UpdateBoardUI();
        game2048UpdateUI();
        
        // Добавляем новую плитку
        game2048AddRandomTile();
        
        // Проверка на достижение 2048 (просто уведомление, не остановка)
        let has2048 = false;
        let maxValue = 0;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (game2048Board[i][j] === 2048) {
                    has2048 = true;
                }
                if (game2048Board[i][j] > maxValue) maxValue = game2048Board[i][j];
            }
        }
        
        if (has2048 && !window.game2048WinShown) {
            window.game2048WinShown = true;
            showToast('🎉 Поздравляем! Вы достигли 2048! Игра продолжается! 🎉');
        }
        
        if (maxValue > 2048 && maxValue % 2048 === 0 && maxValue !== window.lastNotifiedValue) {
            window.lastNotifiedValue = maxValue;
            showToast(`🌟 Фантастика! ${maxValue} очков! 🌟`);
        }
        
        // Проверка на поражение
        if (!game2048CanMove()) {
            showToast('😢 Игра окончена! Нажмите "Новая игра" чтобы продолжить');
        }
    }
    
    game2048Animating = false;
}

function game2048CanMove() {
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            if (game2048Board[i][j] === 0) return true;
            if (j < 3 && game2048Board[i][j] === game2048Board[i][j + 1]) return true;
            if (i < 3 && game2048Board[i][j] === game2048Board[i + 1][j]) return true;
        }
    }
    return false;
}

function game2048HandleKey(e) {
    const modal = document.getElementById('game2048Modal');
    if (!modal || !modal.classList.contains('show')) return;
    
    let key = e.key;
    if (key === 'ArrowUp') game2048Move('up');
    else if (key === 'ArrowDown') game2048Move('down');
    else if (key === 'ArrowLeft') game2048Move('left');
    else if (key === 'ArrowRight') game2048Move('right');
}

let game2048TouchStartX = 0, game2048TouchStartY = 0;

function game2048HandleTouchStart(e) {
    const modal = document.getElementById('game2048Modal');
    if (!modal || !modal.classList.contains('show')) return;
    game2048TouchStartX = e.touches[0].clientX;
    game2048TouchStartY = e.touches[0].clientY;
}

function game2048HandleTouchEnd(e) {
    const modal = document.getElementById('game2048Modal');
    if (!modal || !modal.classList.contains('show')) return;
    if (!game2048TouchStartX || !game2048TouchStartY) return;
    
    let diffX = e.changedTouches[0].clientX - game2048TouchStartX;
    let diffY = e.changedTouches[0].clientY - game2048TouchStartY;
    
    if (Math.abs(diffX) < 20 && Math.abs(diffY) < 20) return;
    
    if (Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX > 0) game2048Move('right');
        else game2048Move('left');
    } else {
        if (diffY > 0) game2048Move('down');
        else game2048Move('up');
    }
    
    game2048TouchStartX = 0;
    game2048TouchStartY = 0;
}

function game2048NewGame() {
    window.game2048WinShown = false;
    game2048Init();
}

function game2048OpenModal() {
    window.game2048WinShown = false;
    game2048Init();
    document.getElementById('game2048Modal').classList.add('show');
    document.body.classList.add('game2048-modal-open');
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
}

function game2048OpenModal() {
    window.game2048WinShown = false;
    game2048Init();
    document.getElementById('game2048Modal').classList.add('show');
    document.body.classList.add('game2048-modal-open');
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
}

function game2048OpenModal() {
    window.game2048WinShown = false;
    game2048Init();
    document.getElementById('game2048Modal').classList.add('show');
    document.body.classList.add('game2048-modal-open');
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
}
function game2048OpenModal() {
    game2048Init();
    document.getElementById('game2048Modal').classList.add('show');
    document.body.classList.add('game2048-modal-open');
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
}

function updateSettingsUI() {
    const settingsAvatar = document.getElementById('settingsAvatar');
    const settingsName = document.getElementById('settingsUserName');
    const settingsId = document.getElementById('settingsUserUniqueId');
    
    if (settingsName) settingsName.textContent = currentUser?.name || 'Пользователь';
    if (settingsId) settingsId.textContent = currentUser?.uniqueId || 'ID...';
    
    if (settingsAvatar && currentUser?.avatar) {
        settingsAvatar.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`;
    } else if (settingsAvatar) {
        settingsAvatar.innerHTML = '👤';
    }
}

document.getElementById('settingsProfileBtn')?.addEventListener('click', () => {
    document.getElementById('profileModal').classList.add('show');
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========
async function init() {
    console.log('Инициализация...');
    await waitForFirebase();
    await loadCurrentUser();
    setupNavigation();
    setupEventListeners();
    await loadFriends();
    await loadFeed();
    updateUserUI();
    updateSettingsUI();
    loadTheme();
    setupThemeDropdown();
    checkMobile();
    setupMobileNav();
    console.log('Готово!');
}

init();