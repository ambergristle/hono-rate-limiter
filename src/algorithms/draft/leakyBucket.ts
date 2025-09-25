// leaky bucket as meter, leaky bucket as queue

class LeakyBucket {
	public capacity: number;
	public drops: number;
	public lastUpdatedAt: number;
	public leakRate: number;

	public consume(key: string, cost: number) {
		const now = Date.now();
		const millisecondsElapsed = now - this.lastUpdatedAt;
		this.lastUpdatedAt = now;

		// Decrement drops leaked since last call
		// todo: 0 guard
		this.drops -= this.leakRate * millisecondsElapsed;

		const nextTokens = this.drops + cost;
		if (nextTokens <= this.capacity) {
			this.drops = nextTokens;
			return true;
		}

		return false;
	}
}
