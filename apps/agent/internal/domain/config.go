package domain

type GatewayRule struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
	Proxy   string `json:"proxy"`
	Raw     string `json:"raw,omitempty"`
}

type GatewayProxy struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Now  string `json:"now,omitempty"`
}

type GatewayProvider struct {
	Name    string         `json:"name"`
	Type    string         `json:"type"`
	Proxies []GatewayProxy `json:"proxies"`
}

type GatewayConfigSnapshot struct {
	Rules     []GatewayRule              `json:"rules"`
	Proxies   map[string]GatewayProxy    `json:"proxies"`
	Providers map[string]GatewayProvider `json:"providers"`
	Timestamp int64                      `json:"timestamp"`
	Hash      string                     `json:"hash"`
}
