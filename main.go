package main

import (
	"net/http"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type OrderStatus string

const (
	StatusNew       OrderStatus = "new"
	StatusPreparing OrderStatus = "preparing"
	StatusReady     OrderStatus = "ready"
)

type Order struct {
	ID           string      `json:"id"`
	CustomerName string      `json:"customerName"`
	ItemName     string      `json:"itemName"`
	Quantity     int         `json:"quantity"`
	Status       OrderStatus `json:"status"`
	CreatedAt    time.Time   `json:"createdAt"`
}

type CreateOrderRequest struct {
	CustomerName string `json:"customerName"`
	ItemName     string `json:"itemName"`
	Quantity     int    `json:"quantity"`
}

type UpdateStatusRequest struct {
	Status OrderStatus `json:"status"`
}

type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type Store struct {
	mu     sync.RWMutex
	orders map[string]Order
}

func NewStore() *Store {
	return &Store{
		orders: make(map[string]Order),
	}
}

func (s *Store) ListOrders() []Order {
	s.mu.RLock()
	defer s.mu.RUnlock()

	orders := make([]Order, 0, len(s.orders))
	for _, order := range s.orders {
		orders = append(orders, order)
	}

	sort.Slice(orders, func(i, j int) bool {
		return orders[i].CreatedAt.After(orders[j].CreatedAt)
	})

	return orders
}

func (s *Store) CreateOrder(req CreateOrderRequest) (Order, string) {
	if req.CustomerName == "" {
		return Order{}, "customerName is required"
	}
	if req.ItemName == "" {
		return Order{}, "itemName is required"
	}
	if req.Quantity <= 0 {
		return Order{}, "quantity must be greater than 0"
	}

	order := Order{
		ID:           generateID(),
		CustomerName: req.CustomerName,
		ItemName:     req.ItemName,
		Quantity:     req.Quantity,
		Status:       StatusNew,
		CreatedAt:    time.Now().UTC(),
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.orders[order.ID] = order

	return order, ""
}

func (s *Store) UpdateOrderStatus(id string, nextStatus OrderStatus) (Order, string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	order, exists := s.orders[id]
	if !exists {
		return Order{}, "order not found"
	}

	if !isValidTransition(order.Status, nextStatus) {
		return Order{}, "invalid status transition"
	}

	order.Status = nextStatus
	s.orders[id] = order

	return order, ""
}

func isValidTransition(current, next OrderStatus) bool {
	return (current == StatusNew && next == StatusPreparing) ||
		(current == StatusPreparing && next == StatusReady)
}

func generateID() string {
	return time.Now().UTC().Format("20060102150405.000000000")
}

type Hub struct {
	mu        sync.Mutex
	clients   map[*websocket.Conn]bool
	broadcast chan Event
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan Event, 32),
	}
}

func (h *Hub) Run() {
	for event := range h.broadcast {
		h.mu.Lock()
		for conn := range h.clients {
			if err := conn.WriteJSON(event); err != nil {
				conn.Close()
				delete(h.clients, conn)
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) AddClient(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = true
}

func (h *Hub) RemoveClient(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
	conn.Close()
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func main() {
	store := NewStore()
	hub := NewHub()
	go hub.Run()

	router := gin.Default()

	router.Static("/web", "./web")
	router.StaticFile("/", "./web/index.html")

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "ok",
		})
	})

	api := router.Group("/api")
	{
		api.GET("/orders", func(c *gin.Context) {
			c.JSON(http.StatusOK, store.ListOrders())
		})

		api.POST("/orders", func(c *gin.Context) {
			var req CreateOrderRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "invalid request body",
				})
				return
			}

			order, msg := store.CreateOrder(req)
			if msg != "" {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": msg,
				})
				return
			}

			hub.broadcast <- Event{
				Type: "order_created",
				Data: order,
			}

			c.JSON(http.StatusCreated, order)
		})

		api.PATCH("/orders/:id/status", func(c *gin.Context) {
			id := c.Param("id")

			var req UpdateStatusRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "invalid request body",
				})
				return
			}

			order, msg := store.UpdateOrderStatus(id, req.Status)
			if msg != "" {
				statusCode := http.StatusBadRequest
				if msg == "order not found" {
					statusCode = http.StatusNotFound
				}

				c.JSON(statusCode, gin.H{
					"error": msg,
				})
				return
			}

			hub.broadcast <- Event{
				Type: "order_updated",
				Data: order,
			}

			c.JSON(http.StatusOK, order)
		})
	}

	router.GET("/ws", func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}

		hub.AddClient(conn)

		defer hub.RemoveClient(conn)

		for {
			//detect closed connections.
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	router.Run(":" + port)
}
