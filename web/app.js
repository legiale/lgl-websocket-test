let orders = [];
let socket = null;

const orderForm = document.getElementById("orderForm");
const customerNameInput = document.getElementById("customerName");
const itemNameInput = document.getElementById("itemName");
const quantityInput = document.getElementById("quantity");
const submitBtn = document.getElementById("submitBtn");
const formError = document.getElementById("formError");
const connectionBadge = document.getElementById("connectionBadge");

const colNew = document.getElementById("col-new");
const colPreparing = document.getElementById("col-preparing");
const colReady = document.getElementById("col-ready");

const countNew = document.getElementById("count-new");
const countPreparing = document.getElementById("count-preparing");
const countReady = document.getElementById("count-ready");

document.addEventListener("DOMContentLoaded", async () => {
    await fetchOrders();
    connectWebSocket();
    registerEvents();
    renderOrders();
});

function registerEvents() {
    orderForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        formError.textContent = "";

        const payload = {
            customerName: customerNameInput.value.trim(),
            itemName: itemNameInput.value.trim(),
            quantity: Number(quantityInput.value),
        };

        if (!payload.customerName) {
            formError.textContent = "Customer name is required.";
            return;
        }

        if (!payload.itemName) {
            formError.textContent = "Item name is required.";
            return;
        }

        if (!payload.quantity || payload.quantity <= 0) {
            formError.textContent = "Quantity must be greater than 0.";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Creating...";

        try {
            const res = await fetch("/api/orders", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                formError.textContent = data.error || "Failed to create order.";
                return;
            }

            orderForm.reset();
            quantityInput.value = 1;
            formError.textContent = "";
        } catch (err) {
            formError.textContent = "Network error while creating order.";
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create Order";
        }
    });
}

async function fetchOrders() {
    try {
        const res = await fetch("/api/orders");
        const data = await res.json();
        orders = Array.isArray(data) ? data : [];
    } catch (err) {
        console.error("Failed to fetch orders:", err);
        orders = [];
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        setConnectionBadge("Connected", "success");
    };

    socket.onclose = () => {
        setConnectionBadge("Disconnected", "warning");
        setTimeout(connectWebSocket, 1500);
    };

    socket.onerror = () => {
        setConnectionBadge("Connection Error", "warning");
    };

    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);

            if (message.type === "order_created") {
                upsertOrder(message.data);
            } else if (message.type === "order_updated") {
                upsertOrder(message.data);
            }

            renderOrders();
        } catch (err) {
            console.error("Invalid WS message:", err);
        }
    };
}

function setConnectionBadge(text, type) {
    connectionBadge.textContent = text;
    connectionBadge.className = "badge";

    if (type === "success") {
        connectionBadge.classList.add("badge-success");
    } else {
        connectionBadge.classList.add("badge-warning");
    }
}

function upsertOrder(order) {
    const idx = orders.findIndex((o) => o.id === order.id);

    if (idx >= 0) {
        orders[idx] = order;
    } else {
        orders.push(order);
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderOrders() {
    const newOrders = orders.filter((o) => o.status === "new");
    const preparingOrders = orders.filter((o) => o.status === "preparing");
    const readyOrders = orders.filter((o) => o.status === "ready");

    countNew.textContent = String(newOrders.length);
    countPreparing.textContent = String(preparingOrders.length);
    countReady.textContent = String(readyOrders.length);

    colNew.innerHTML = renderColumn(newOrders, "new");
    colPreparing.innerHTML = renderColumn(preparingOrders, "preparing");
    colReady.innerHTML = renderColumn(readyOrders, "ready");

    bindActionButtons();
}

function renderColumn(list, status) {
    if (!list.length) {
        return `<div class="empty-state">No ${status} orders</div>`;
    }

    return list.map(renderCard).join("");
}

function renderCard(order) {
    let actionHtml = "";

    if (order.status === "new") {
        actionHtml = `<button class="action-btn" data-id="${order.id}" data-next-status="preparing">Move to Preparing</button>`;
    } else if (order.status === "preparing") {
        actionHtml = `<button class="action-btn" data-id="${order.id}" data-next-status="ready">Move to Ready</button>`;
    }

    return `
    <div class="card">
      <div class="card-title">${escapeHtml(order.customerName)}</div>
      <div class="card-line"><strong>Item:</strong> ${escapeHtml(order.itemName)}</div>
      <div class="card-line"><strong>Qty:</strong> ${order.quantity}</div>
      <div class="card-line"><strong>Created:</strong> ${formatTime(order.createdAt)}</div>
      <div class="card-actions">
        ${actionHtml}
      </div>
    </div>
  `;
}

function bindActionButtons() {
    document.querySelectorAll(".action-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const nextStatus = btn.dataset.nextStatus;
            btn.disabled = true;
            btn.textContent = "Updating...";

            try {
                const res = await fetch(`/api/orders/${id}/status`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ status: nextStatus }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    alert(data.error || "Failed to update status.");
                }
            } catch (err) {
                alert("Network error while updating status.");
            } finally {
                btn.disabled = false;
            }
        });
    });
}

function formatTime(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString();
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}