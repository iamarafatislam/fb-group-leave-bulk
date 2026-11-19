// State
let groups = [];
let selectedIds = new Set();
let isRunning = false;
let stopRequested = false;

// DOM Elements
const statusDotEl = document.getElementById("statusDot");
const statusTextEl = document.getElementById("statusText");
const refreshBtn = document.getElementById("refreshBtn");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const filteredCountEl = document.getElementById("filteredCount");
const totalCountEl = document.getElementById("totalCount");
const speedSelect = document.getElementById("speedSelect");
const selectAllBtn = document.getElementById("selectAllBtn");
const skeletonLoadingEl = document.getElementById("skeletonLoading");
const emptyStateEl = document.getElementById("emptyState");
const emptyStateMsgEl = document.getElementById("emptyStateMsg");
const groupListEl = document.getElementById("groupList");
const actionBarEl = document.getElementById("actionBar");
const selCountNumberEl = document.getElementById("selCountNumber");
const leaveBtn = document.getElementById("leaveBtn");

// Progress elements
const listViewEl = document.getElementById("listView");
const progressViewEl = document.getElementById("progressView");
const progressPercentEl = document.getElementById("progressPercent");
const progressEtaEl = document.getElementById("progressEta");
const progressBarFillEl = document.getElementById("progressBarFill");
const npNameEl = document.getElementById("npName");
const statOkEl = document.getElementById("statOk");
const statFailEl = document.getElementById("statFail");
const stopBtn = document.getElementById("stopBtn");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Streamed progressive loading listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "RESOURCE_PAGE" && msg.resource === "groups") {
    const batch = msg.items || [];
    const newItems = batch.filter((item) => !groups.some((g) => g.id === item.id));
    if (newItems.length > 0) {
      groups.push(...newItems);
      skeletonLoadingEl.classList.add("hidden");
      renderGroups();
      updateSelectionUI();
    }
  }
});

// Session Check
async function checkLogin() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "WHOAMI" }, (res) => {
      if (res?.ok && res.userId) {
        statusDotEl.className = "dot connected";
        statusTextEl.textContent = `Connected (User ID: ${res.userId})`;
        resolve(true);
      } else {
        statusDotEl.className = "dot disconnected";
        statusTextEl.textContent = "Not logged into Facebook";
        resolve(false);
      }
    });
  });
}

// Fetch Groups using proven background protocol
async function fetchAllGroups() {
  groups = [];
  selectedIds.clear();
  updateSelectionUI();
  renderGroups();

  skeletonLoadingEl.classList.remove("hidden");
  emptyStateEl.classList.add("hidden");

  let cursor = null;
  let hasMore = true;

  try {
    while (hasMore) {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "LOAD_RESOURCE",
            resource: "groups",
            cursor: cursor,
            delayMs: 1500
          },
          resolve
        );
      });

      if (!res?.ok) {
        throw new Error(res?.error || "Failed to load groups");
      }

      const batch = res.items || [];
      const newItems = batch.filter((item) => !groups.some((g) => g.id === item.id));
      if (newItems.length > 0) {
        groups.push(...newItems);
      }

      skeletonLoadingEl.classList.add("hidden");
      renderGroups();
      updateSelectionUI();

      cursor = res.endCursor;
      hasMore = Boolean(res.hasNext && cursor);

      if (hasMore) await sleep(400);
    }
  } catch (err) {
    statusDotEl.className = "dot disconnected";
    statusTextEl.textContent = `Error: ${err.message}`;
    skeletonLoadingEl.classList.add("hidden");
  } finally {
    skeletonLoadingEl.classList.add("hidden");
    if (groups.length === 0) {
      emptyStateEl.classList.remove("hidden");
      emptyStateMsgEl.textContent = "No Facebook groups found.";
    }
  }
}

// Render Groups List
function renderGroups() {
  const query = searchInput.value.trim().toLowerCase();
  clearSearchBtn.classList.toggle("hidden", query.length === 0);

  const filtered = groups.filter((g) => g.name.toLowerCase().includes(query));

  filteredCountEl.textContent = filtered.length;
  totalCountEl.textContent = groups.length;
  groupListEl.innerHTML = "";

  if (filtered.length === 0 && groups.length > 0) {
    emptyStateEl.classList.remove("hidden");
    emptyStateMsgEl.textContent = "No groups matching your search.";
    return;
  } else if (groups.length > 0) {
    emptyStateEl.classList.add("hidden");
  }

  filtered.forEach((g) => {
    const li = document.createElement("li");
    const isSelected = selectedIds.has(g.id);
    li.className = `friend ${isSelected ? "selected" : ""} ${g.left ? "unfollowed" : ""}`;
    li.dataset.id = g.id;

    // Checkbox indicator
    const box = document.createElement("div");
    box.className = "box";
    box.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    // Avatar / Icon
    const img = document.createElement("img");
    img.className = "avatar";
    img.src = g.avatar || "icons/icon-32.png";
    img.alt = "";

    // Info
    const info = document.createElement("div");
    info.className = "friend-info";

    const name = document.createElement("div");
    name.className = "friend-name";
    name.textContent = g.name;

    const handle = document.createElement("div");
    handle.className = "friend-handle";
    handle.textContent = g.meta || (g.url ? g.url.replace(/^https:\/\/(www\.)?facebook\.com\/?/, "") : `id: ${g.id}`);

    info.appendChild(name);
    info.appendChild(handle);

    li.appendChild(box);
    li.appendChild(img);
    li.appendChild(info);

    if (g.left) {
      const badge = document.createElement("span");
      badge.className = "rowstatus success";
      badge.textContent = "Left";
      li.appendChild(badge);
    }

    li.addEventListener("click", () => {
      if (isRunning || g.left) return;
      if (selectedIds.has(g.id)) {
        selectedIds.delete(g.id);
        li.classList.remove("selected");
      } else {
        selectedIds.add(g.id);
        li.classList.add("selected");
      }
      updateSelectionUI();
    });

    groupListEl.appendChild(li);
  });
}

function updateSelectionUI() {
  const count = selectedIds.size;
  selCountNumberEl.textContent = count;
  actionBarEl.classList.toggle("show", count > 0);

  const query = searchInput.value.trim().toLowerCase();
  const eligible = groups.filter((g) => !g.left && g.name.toLowerCase().includes(query));
  const allEligibleSelected = eligible.length > 0 && eligible.every((g) => selectedIds.has(g.id));

  selectAllBtn.textContent = allEligibleSelected ? "Deselect All" : "Select All";
}

// Select All Toggle
selectAllBtn.addEventListener("click", () => {
  if (isRunning) return;
  const query = searchInput.value.trim().toLowerCase();
  const eligible = groups.filter((g) => !g.left && g.name.toLowerCase().includes(query));
  const allEligibleSelected = eligible.length > 0 && eligible.every((g) => selectedIds.has(g.id));

  if (allEligibleSelected) {
    eligible.forEach((g) => selectedIds.delete(g.id));
  } else {
    eligible.forEach((g) => selectedIds.add(g.id));
  }

  updateSelectionUI();
  renderGroups();
});

// Search & Refresh
searchInput.addEventListener("input", renderGroups);
clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  renderGroups();
});

refreshBtn.addEventListener("click", async () => {
  if (isRunning) return;
  await checkLogin();
  await fetchAllGroups();
});

// Leave Execution
leaveBtn.addEventListener("click", async () => {
  if (selectedIds.size === 0 || isRunning) return;

  const count = selectedIds.size;
  const confirmed = window.confirm(`Are you sure you want to leave ${count} selected Facebook groups?`);
  if (!confirmed) return;

  isRunning = true;
  stopRequested = false;

  // Switch to progress view
  listViewEl.classList.remove("active");
  progressViewEl.classList.add("active");
  stopBtn.disabled = false;
  stopBtn.textContent = "Stop Leaving";

  const targetIds = Array.from(selectedIds);
  const total = targetIds.length;
  let done = 0;
  let okCount = 0;
  let failCount = 0;
  const delayMs = parseInt(speedSelect.value, 10) || 2500;

  for (const groupId of targetIds) {
    if (stopRequested) break;

    const group = groups.find((g) => g.id === groupId);
    npNameEl.textContent = group?.name || groupId;

    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "RESOURCE_ACTION",
          resource: "groups",
          item: group || { id: groupId }
        },
        resolve
      );
    });

    if (res?.ok && res.status === "success") {
      if (group) group.left = true;
      selectedIds.delete(groupId);
      okCount++;
      statOkEl.textContent = okCount;
    } else {
      failCount++;
      statFailEl.textContent = failCount;
    }

    done++;
    const pct = Math.round((done / total) * 100);
    progressBarFillEl.style.width = `${pct}%`;
    progressPercentEl.textContent = `${pct}%`;

    const remainingItems = total - done;
    const etaSec = Math.round((remainingItems * delayMs) / 1000);
    progressEtaEl.textContent = remainingItems > 0 ? `ETA ~${etaSec}s` : "Done";

    if (done < total && !stopRequested) {
      await sleep(delayMs);
    }
  }

  await sleep(1200);

  // Switch back to list view
  progressViewEl.classList.remove("active");
  listViewEl.classList.add("active");
  isRunning = false;

  updateSelectionUI();
  renderGroups();
});

stopBtn.addEventListener("click", () => {
  stopRequested = true;
  stopBtn.textContent = "Stopping...";
  stopBtn.disabled = true;
});

// Init
(async function init() {
  await checkLogin();
  await fetchAllGroups();
})();
