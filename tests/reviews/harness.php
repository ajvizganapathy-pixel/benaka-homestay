<?php
/*
 * Test harness for the guest review system: a throwaway database, a test
 * config, an injectable clock, and the PHP built-in server with several
 * workers (so two requests really can run at once).
 *
 * Needs a MySQL/MariaDB the test can CREATE DATABASE on. It tries, in order:
 *   REVIEWS_TEST_DSN / REVIEWS_TEST_USER / REVIEWS_TEST_PASS   (CI sets these)
 *   root over the local socket (a workspace MariaDB)
 * Every run makes its own database gr_test_<random> and drops it afterwards.
 *
 * Nothing here is reachable on the web: tests/ answers 404 in .htaccess.
 */
declare(strict_types=1);

final class Env {
    public string $root, $dir, $dbName, $base, $cfgPath, $clockFile, $hashFile, $setupKey, $code;
    public array $cfg;
    private $proc = null;
    private static ?array $conn = null;

    /** @return array{0:string,1:string,2:string}|null  [dsn without dbname, user, pass] */
    public static function connection(): ?array {
        if (self::$conn !== null) return self::$conn ?: null;
        $tries = [];
        if (getenv('REVIEWS_TEST_DSN')) $tries[] = [getenv('REVIEWS_TEST_DSN'), (string)getenv('REVIEWS_TEST_USER'), (string)getenv('REVIEWS_TEST_PASS')];
        foreach (['/run/mysqld/mysqld.sock', '/var/run/mysqld/mysqld.sock', '/tmp/mysql.sock'] as $sock) {
            if (file_exists($sock)) $tries[] = ["mysql:unix_socket=$sock", 'root', ''];
        }
        foreach ($tries as $t) {
            try {
                new PDO($t[0], $t[1], $t[2], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]);
                return self::$conn = $t;
            } catch (Throwable $e) { /* next */ }
        }
        self::$conn = [];
        return null;
    }

    public static function up(array $override = []): Env {
        $c = self::connection();
        if (!$c) throw new RuntimeException('no MySQL/MariaDB reachable for the review tests');
        $e = new Env();
        $e->root = dirname(__DIR__, 2);
        $e->dir = sys_get_temp_dir() . '/gr-test-' . bin2hex(random_bytes(4));
        mkdir($e->dir, 0700, true);
        $e->dbName = 'gr_test_' . bin2hex(random_bytes(4));
        $root = new PDO($c[0], $c[1], $c[2], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $root->exec("CREATE DATABASE `{$e->dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $e->migrate('001_guest_reviews.sql');

        $e->cfgPath = $e->dir . '/config.php';
        $e->clockFile = $e->dir . '/clock';
        $e->hashFile = $e->dir . '/owner.hash';
        $e->setupKey = 'test-setup-' . bin2hex(random_bytes(12));
        // A fresh random code every run, so no code is ever written down in
        // the repository, not even a test one.
        $e->code = (string)random_int(1, 9) . substr(str_pad((string)random_int(0, 999999999), 9, '0', STR_PAD_LEFT), 0, 9);
        $e->cfg = array_merge([
            'REVIEWS_ENABLED' => true,
            'DB_DSN' => $c[0] . ';dbname=' . $e->dbName . ';charset=utf8mb4',
            'DB_USER' => $c[1], 'DB_PASS' => $c[2],
            'OWNER_CODE_HASH' => '', 'OWNER_HASH_FILE' => $e->hashFile,
            'SETUP_KEY' => $e->setupKey,
            'PEPPER' => bin2hex(random_bytes(16)),
            'SITE_URL' => '', 'OWNER_WHATSAPP' => '919448647831',
            'COOKIE_SECURE' => false,
            'TEST_CLOCK_FILE' => $e->clockFile,
        ], $override);
        $e->start();
        return $e;
    }

    public function migrate(string $file): void {
        $sql = file_get_contents($this->root . '/migrations/' . $file);
        $sql = preg_replace('/--[^\n]*/', '', $sql);   // no string literal in these files contains --
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) $this->pdo()->exec($stmt);
    }

    public function pdo(): PDO {
        $c = self::connection();
        return new PDO($c[0] . ';dbname=' . $this->dbName . ';charset=utf8mb4', $c[1], $c[2],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    }

    public function writeConfig(array $changes = []): void {
        $this->cfg = array_merge($this->cfg, $changes);
        $this->cfg['SITE_URL'] = $this->base;
        file_put_contents($this->cfgPath, '<?php return ' . var_export($this->cfg, true) . ';');
        if (function_exists('opcache_invalidate')) @opcache_invalidate($this->cfgPath, true);
    }

    /** Set the server's clock (ISO 8601, UTC) or give it back to the real one. */
    public function clock(?string $iso): void {
        file_put_contents($this->clockFile, $iso ?? '');
    }

    private function start(): void {
        $port = self::freePort();
        $this->base = "http://127.0.0.1:$port";
        $this->writeConfig();
        $env = array_merge(getenv(), ['BENAKA_REVIEWS_CONFIG' => $this->cfgPath, 'PHP_CLI_SERVER_WORKERS' => '4']);
        $cmd = [PHP_BINARY, '-d', 'display_errors=0', '-S', "127.0.0.1:$port", '-t', $this->root];
        $this->proc = proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['file', $this->dir . '/server.log', 'a'], 2 => ['file', $this->dir . '/server.log', 'a']], $pipes, $this->root, $env);
        for ($i = 0; $i < 50; $i++) {
            $s = @fsockopen('127.0.0.1', $port, $errno, $err, 0.1);
            if ($s) { fclose($s); return; }
            usleep(100000);
        }
        throw new RuntimeException('test server did not start');
    }

    public function down(): void {
        if (is_resource($this->proc)) {
            $st = proc_get_status($this->proc);
            // php -S with workers: stop the whole process group's children too.
            @exec('pkill -P ' . (int)$st['pid'] . ' 2>/dev/null');
            proc_terminate($this->proc);
            proc_close($this->proc);
        }
        try { $c = self::connection(); (new PDO($c[0], $c[1], $c[2]))->exec("DROP DATABASE IF EXISTS `{$this->dbName}`"); } catch (Throwable $e) {}
        foreach (glob($this->dir . '/*') ?: [] as $f) @unlink($f);
        @rmdir($this->dir);
    }

    private static function freePort(): int {
        $s = stream_socket_server('tcp://127.0.0.1:0');
        $name = stream_socket_get_name($s, false);
        fclose($s);
        return (int)substr($name, strrpos($name, ':') + 1);
    }

    public function client(): Client { return new Client($this->base); }

    /** Run the one-time setup and return a signed-in owner client. */
    public function owner(): Client {
        $c = $this->client();
        if (!is_file($this->hashFile)) {
            $r = $c->post('/review-api/owner.php', ['action' => 'setup', 'setup_key' => $this->setupKey, 'code' => $this->code]);
            if (($r['json']['ok'] ?? false) !== true) throw new RuntimeException('setup failed: ' . $r['body']);
            $c->csrf = $r['json']['csrf'];
            return $c;
        }
        $r = $c->post('/review-api/owner.php', ['action' => 'login', 'code' => $this->code]);
        if (($r['json']['ok'] ?? false) !== true) throw new RuntimeException('login failed: ' . $r['body']);
        $c->csrf = $r['json']['csrf'];
        return $c;
    }

    /** Create an invitation as the owner; returns [token, response json]. */
    public function invite(Client $owner, array $fields = []): array {
        $r = $owner->post('/review-api/owner.php', array_merge([
            'action' => 'create', 'name' => 'Test Guest One', 'phone' => '+91 90000 00001',
            'stay_from' => '2026-10-01', 'stay_to' => '2026-10-04', 'expiry_days' => 30, 'require_check' => false,
        ], $fields));
        if (($r['json']['ok'] ?? false) !== true) throw new RuntimeException('create failed: ' . $r['body']);
        return [explode('#t=', $r['json']['link'])[1], $r['json']];
    }

    public function submit(string $token, array $fields = []): array {
        return $this->client()->post('/review-api/invite.php', array_merge([
            'action' => 'submit', 'token' => $token, 'rating' => 5,
            'body' => 'Test review text that is long enough to be accepted.', 'consent' => true, 'website' => '',
        ], $fields));
    }
}

final class Client {
    public array $cookies = [];
    public string $csrf = '';
    /** Every response body this client has seen, for the leak scans. */
    public static array $seen = [];

    public function __construct(public string $base) {}

    public function get(string $path, array $headers = []): array { return $this->req('GET', $path, null, $headers); }
    public function post(string $path, ?array $json, array $headers = []): array { return $this->req('POST', $path, $json, $headers); }

    public function req(string $method, string $path, ?array $json, array $headers = [], ?string $raw = null): array {
        $h = $this->prepare($method, $json, $headers, $raw);
        $ch = curl_init($this->base . $path);
        curl_setopt_array($ch, $h);
        $resp = curl_exec($ch);
        return $this->finish($ch, $resp);
    }

    /** @internal shared with the concurrency test, which drives curl_multi itself */
    public function handle(string $method, string $path, ?array $json) {
        $ch = curl_init($this->base . $path);
        curl_setopt_array($ch, $this->prepare($method, $json, [], null));
        return $ch;
    }

    private function prepare(string $method, ?array $json, array $headers, ?string $raw): array {
        $hs = ['Accept: application/json'];
        if ($method === 'POST') {
            if (!array_key_exists('Content-Type', $headers)) $hs[] = 'Content-Type: application/json';
            if ($this->csrf !== '' && !array_key_exists('X-CSRF-Token', $headers)) $hs[] = 'X-CSRF-Token: ' . $this->csrf;
        }
        foreach ($headers as $k => $v) if ($v !== null) $hs[] = "$k: $v";
        if ($this->cookies) $hs[] = 'Cookie: ' . implode('; ', array_map(fn($k, $v) => "$k=$v", array_keys($this->cookies), $this->cookies));
        $o = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true,
              CURLOPT_HTTPHEADER => $hs, CURLOPT_TIMEOUT => 20];
        if ($method === 'POST') $o[CURLOPT_POSTFIELDS] = $raw ?? json_encode($json ?? []);
        return $o;
    }

    public function finish($ch, $resp): array {
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $hsize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $head = substr((string)$resp, 0, $hsize);
        $body = substr((string)$resp, $hsize);
        foreach (preg_split('/\r\n/', $head) as $line) {
            if (preg_match('/^Set-Cookie:\s*([^=]+)=([^;]*)/i', $line, $m)) {
                if ($m[2] === '' || stripos($line, 'expires=Thu, 01 Jan 1970') !== false || preg_match('/Max-Age=0/i', $line)) unset($this->cookies[$m[1]]);
                else $this->cookies[$m[1]] = $m[2];
            }
        }
        self::$seen[] = ['status' => $status, 'head' => $head, 'body' => $body];
        return ['status' => $status, 'head' => $head, 'body' => $body, 'json' => json_decode($body, true)];
    }
}
