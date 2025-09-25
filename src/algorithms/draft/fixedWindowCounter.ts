class FixedWindow {
	public windowMilliseconds: number;
	public maxRequests: number;
	public requests: number;
	public windowStartedAt: number;

	public consume(key: string, cost: number) {
		const now = Date.now();
		if (now - this.windowStartedAt >= this.windowMilliseconds) {
			this.requests = 0;
			this.windowStartedAt = now;
		}

		if (this.requests < this.maxRequests) {
			this.requests += cost;
			return true;
		}

		return false;
	}
}
