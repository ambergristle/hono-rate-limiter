import { beforeEach, describe, expect, test } from 'bun:test';
import { HTTPException } from 'hono/http-exception'

new HTTPException(400)

describe('configuration', () => {

  test('requires key generator', async () => { });

  test('calls adapter init', () => { });

});

describe('request handling', () => {

  test('allows initial request', async () => { });

  test('rejects requests that exceed limit', async () => { });

  test('allows additional requests after cooldown', async () => { });

  test('blocks all requests if limit is 0', async () => { });

  test('sets headers', async () => { });

  test('refunds', async () => { });
});

// control timers

// concurrent requests
// limits isolated per id?
// invalid id handling
// configurable windows
// storage failures
// response time - 
// resource use - 

