<?php
declare(strict_types=1);
require __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Vary: Cookie');
$https = !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off';
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.gc_maxlifetime', '1800');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

function out(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function needMethod(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        out(['error' => 'Method not allowed.'], 405);
    }
}
function body(): array
{
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 100000)
        out(['error' => 'Request is too large.'], 413);
    $raw = file_get_contents('php://input', false, null, 0, 100001);
    if (strlen($raw) > 100000)
        out(['error' => 'Request is too large.'], 413);
    $v = json_decode($raw ?: '{}', true);
    if (!is_array($v))
        out(['error' => 'Invalid request data.'], 400);
    return $v;
}
function csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $known = $_SESSION['csrf'] ?? '';
    if (!$known || !is_string($sent) || !hash_equals($known, $sent))
        out(['error' => 'Request expired. Reload and try again.'], 403);
}
function isLocalRequest(): bool
{
    return in_array((string) ($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
}
function applicationKey(): string
{
    $key = getenv('FIELDNOTES_APP_KEY');
    if ($key !== false) {
        if (strlen($key) < 32)
            throw new RuntimeException('Application key is not configured.');
        return $key;
    }
    if (!isLocalRequest())
        throw new RuntimeException('Application key is not configured.');
    $dir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'fieldnotes';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir))
        throw new RuntimeException('Could not create local application key storage.');
    $path = $dir . DIRECTORY_SEPARATOR . hash('sha256', realpath(__DIR__ . '/..') ?: __DIR__) . '.key';
    $file = @fopen($path, 'c+');
    if (!$file)
        throw new RuntimeException('Could not open local application key storage.');
    try {
        if (!flock($file, LOCK_EX))
            throw new RuntimeException('Could not lock local application key storage.');
        rewind($file);
        $key = trim((string) stream_get_contents($file));
        if (strlen($key) < 32) {
            $key = bin2hex(random_bytes(32));
            rewind($file);
            if (!ftruncate($file, 0) || fwrite($file, $key) === false || !fflush($file))
                throw new RuntimeException('Could not save local application key.');
            @chmod($path, 0600);
        }
        flock($file, LOCK_UN);
        return $key;
    } finally {
        fclose($file);
    }
}
function localServiceError(Throwable $e): string
{
    if (!isLocalRequest())
        return 'The service is temporarily unavailable. Check server configuration.';
    $message = $e->getMessage();
    if (str_contains($message, 'Database configuration is incomplete'))
        return 'Database settings are missing. Configure the Fieldnotes database host, port, name, username and password for the PHP server.';
    if ($e instanceof PDOException) {
        if (str_contains($message, 'could not find driver'))
            return 'PHP is missing the pdo_mysql extension. Enable it in the PHP configuration used by this server.';
        if (stripos($message, 'Access denied') !== false)
            return 'MySQL rejected the configured database username or password. Check the Fieldnotes database account.';
        if (stripos($message, 'connection refused') !== false || str_contains($message, '10061') || stripos($message, 'No connection') !== false)
            return 'PHP cannot connect to MySQL. Confirm XAMPP MySQL is running and that the configured port matches its Ports column.';
        if (stripos($message, 'Unknown database') !== false)
            return 'The fieldnotes database has not been created yet. Create it in phpMyAdmin, then import database/schema.sql.';
        if (stripos($message, "doesn't exist") !== false || stripos($message, 'Base table or view not found') !== false)
            return 'The Fieldnotes tables are missing. Import database/schema.sql into the configured Fieldnotes database.';
    }
    return 'Local server setup failed. Check the PHP terminal for the Fieldnotes API error.';
}
function activeAdmin(PDO $pdo): array
{
    if (isset($_SESSION['last_activity']) && time() - (int) $_SESSION['last_activity'] > 1800) {
        $_SESSION = [];
        session_regenerate_id(true);
        out(['error' => 'Session expired. Sign in again.'], 401);
    }
    $id = (int) ($_SESSION['admin_id'] ?? 0);
    if (!$id)
        out(['error' => 'Authentication required.'], 401);
    $s = $pdo->prepare('SELECT id,username FROM admin_users WHERE id=? AND is_active=1');
    $s->execute([$id]);
    $user = $s->fetch();
    if (!$user) {
        $_SESSION = [];
        session_regenerate_id(true);
        out(['error' => 'Authentication required.'], 401);
    }
    $_SESSION['last_activity'] = time();
    return $user;
}
function categoryRows(PDO $pdo): array
{
    $rows = $pdo->query('SELECT c.id,c.name,c.slug,c.is_system,COUNT(DISTINCT ac.attraction_id) AS attraction_count FROM categories c LEFT JOIN attraction_categories ac ON ac.category_id=c.id GROUP BY c.id ORDER BY c.is_system DESC,c.name')->fetchAll();
    foreach ($rows as &$row) {
        $row['id'] = (int) $row['id'];
        $row['is_system'] = (int) $row['is_system'];
        $row['attraction_count'] = (int) $row['attraction_count'];
    }
    unset($row);
    return $rows;
}
function places(PDO $pdo, bool $admin = false): array
{
    $rows = $pdo->query("SELECT a.*, GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR '||') category_names, GROUP_CONCAT(DISTINCT f.name ORDER BY f.name SEPARATOR '||') facility_items FROM attractions a LEFT JOIN attraction_categories ac ON ac.attraction_id=a.id LEFT JOIN categories c ON c.id=ac.category_id LEFT JOIN attraction_facilities af ON af.attraction_id=a.id LEFT JOIN facilities f ON f.id=af.facility_id GROUP BY a.id ORDER BY a.name")->fetchAll();
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id'];
        $r['distance_km'] = $r['distance_km'] === null ? null : (float) $r['distance_km'];
        $r['entrance_fee'] = $r['entrance_fee'] === null ? null : (float) $r['entrance_fee'];
        $r['visit_minutes'] = $r['visit_minutes'] === null ? null : (int) $r['visit_minutes'];
        $r['latitude'] = $r['latitude'] === null ? null : (float) $r['latitude'];
        $r['longitude'] = $r['longitude'] === null ? null : (float) $r['longitude'];
        $r['categories'] = $r['category_names'] ? explode('||', $r['category_names']) : [];
        unset($r['category_names']);
        if ($admin) {
            $r['facility_items'] = $r['facility_items'] ? explode('||', $r['facility_items']) : [];
            $s = $pdo->prepare('SELECT category_id FROM attraction_categories WHERE attraction_id=? ORDER BY category_id');
            $s->execute([$r['id']]);
            $r['category_ids'] = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
        } else {
            unset($r['facility_items'], $r['created_at'], $r['updated_at']);
        }
    }
    unset($r);
    return $rows;
}
function onePlace(PDO $pdo, int $id, bool $admin = false): array
{
    $s = $pdo->prepare('SELECT * FROM attractions WHERE id=?');
    $s->execute([$id]);
    $r = $s->fetch();
    if (!$r)
        out(['error' => 'Attraction not found.'], 404);
    $r['id'] = (int) $r['id'];
    foreach (['distance_km', 'entrance_fee', 'latitude', 'longitude'] as $k)
        $r[$k] = $r[$k] === null ? null : (float) $r[$k];
    $r['visit_minutes'] = $r['visit_minutes'] === null ? null : (int) $r['visit_minutes'];
    $s = $pdo->prepare('SELECT c.name,c.id FROM categories c JOIN attraction_categories ac ON ac.category_id=c.id WHERE ac.attraction_id=? ORDER BY c.name');
    $s->execute([$id]);
    $cs = $s->fetchAll();
    $r['categories'] = array_column($cs, 'name');
    if ($admin) {
        $r['category_ids'] = array_map('intval', array_column($cs, 'id'));
        $f = $pdo->prepare('SELECT f.name FROM facilities f JOIN attraction_facilities af ON af.facility_id=f.id WHERE af.attraction_id=? ORDER BY f.name');
        $f->execute([$id]);
        $r['facility_items'] = $f->fetchAll(PDO::FETCH_COLUMN);
    }
    return $r;
}
function validatePlace(array $d, PDO $pdo): array
{
    $rawName = $d['name'] ?? '';
    $rawShort = $d['short_description'] ?? '';
    if (!is_string($rawName) || !is_string($rawShort))
        out(['error' => 'Name and short description must be text.'], 422);
    $name = trim($rawName);
    $short = trim($rawShort);
    $ids = $d['category_ids'] ?? [];
    if ($name === '' || mb_strlen($name) > 180 || $short === '' || mb_strlen($short) > 320)
        out(['error' => 'Name (up to 180 characters) and short description (up to 320 characters) are required.'], 422);
    if (!is_array($ids) || count($ids) < 1 || count($ids) > 10)
        out(['error' => 'Select at least one valid category.'], 422);
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), fn($i) => $i > 0)));
    $q = $pdo->prepare('SELECT id FROM categories WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $q->execute($ids);
    $valid = array_map('intval', $q->fetchAll(PDO::FETCH_COLUMN));
    if (count($valid) !== count($ids))
        out(['error' => 'One or more selected categories do not exist.'], 422);
    $distance = numberOrNull($d['distance_km'] ?? null, 'distance', 0, 25);
    $visit = numberOrNull($d['visit_minutes'] ?? null, 'visit duration', 1, 1440, true);
    $fee = numberOrNull($d['entrance_fee'] ?? null, 'entrance fee', 0, 1000000);
    $lat = numberOrNull($d['latitude'] ?? null, 'latitude', -90, 90);
    $lon = numberOrNull($d['longitude'] ?? null, 'longitude', -180, 180);
    if (($lat === null) !== ($lon === null))
        out(['error' => 'Provide both coordinates, or leave both blank.'], 422);
    $hours = textOrNull($d['opening_hours'] ?? null, 180, 'opening hours');
    $fac = textOrNull($d['facilities'] ?? null, 500, 'facilities');
    $facilityItems = $fac === null ? [] : array_values(array_unique(array_filter(array_map('trim', preg_split('/\r\n|\r|\n/u', $fac) ?: []), fn($v) => $v !== '')));
    if (count($facilityItems) > 20)
        out(['error' => 'Enter no more than 20 facility items.'], 422);
    foreach ($facilityItems as $item)
        if (mb_strlen($item) > 120)
            out(['error' => 'Each facility item must be 120 characters or fewer.'], 422);
    $tips = textOrNull($d['travel_tips'] ?? null, 1200, 'travel tips');
    $desc = textOrNull($d['description'] ?? null, 10000, 'description');
    $image = textOrNull($d['image_url'] ?? null, 2048, 'image URL');
    if ($image !== null && (!filter_var($image, FILTER_VALIDATE_URL) || strtolower((string) parse_url($image, PHP_URL_SCHEME)) !== 'https'))
        out(['error' => 'Image URL must be a valid HTTPS URL.'], 422);
    return ['name' => $name, 'short_description' => $short, 'description' => $desc, 'distance_km' => $distance, 'opening_hours' => $hours, 'entrance_fee' => $fee, 'facilities' => $fac, 'facility_items' => $facilityItems, 'travel_tips' => $tips, 'visit_minutes' => $visit, 'image_url' => $image, 'latitude' => $lat, 'longitude' => $lon, 'category_ids' => $ids];
}
function numberOrNull(mixed $v, string $label, float $min, float $max, bool $integer = false): int|float|null
{
    if ($v === null || $v === '')
        return null;
    if (!is_numeric($v))
        out(['error' => "Invalid {$label}."], 422);
    $n = (float) $v;
    if (!is_finite($n) || $n < $min || $n > $max || ($integer && floor($n) !== $n))
        out(['error' => "Invalid {$label}."], 422);
    return $integer ? (int) $n : $n;
}
function textOrNull(mixed $v, int $max, string $label): ?string
{
    if ($v === null)
        return null;
    if (!is_string($v))
        out(['error' => "Invalid {$label}."], 422);
    $v = trim($v);
    if ($v === '')
        return null;
    if (mb_strlen($v) > $max)
        out(['error' => "Invalid {$label}."], 422);
    return $v;
}
function categoryName(array $d): string
{
    $v = $d['name'] ?? null;
    if (!is_string($v))
        out(['error' => 'Category name must be text.'], 422);
    $v = trim($v);
    if ($v === '' || mb_strlen($v) > 60)
        out(['error' => 'Category name must be 1–60 characters.'], 422);
    return $v;
}
function writePlace(PDO $pdo, array $v, ?int $id = null): int
{
    $cols = ['name', 'short_description', 'description', 'distance_km', 'opening_hours', 'entrance_fee', 'facilities', 'travel_tips', 'visit_minutes', 'image_url', 'latitude', 'longitude'];
    $pdo->beginTransaction();
    try {
        if ($id === null) {
            $sql = 'INSERT INTO attractions (' . implode(',', $cols) . ') VALUES (' . implode(',', array_map(fn($c) => ':' . $c, $cols)) . ')';
            $s = $pdo->prepare($sql);
            $s->execute(array_intersect_key($v, array_flip($cols)));
            $id = (int) $pdo->lastInsertId();
        } else {
            $sql = 'UPDATE attractions SET ' . implode(',', array_map(fn($c) => $c . '=:' . $c, $cols)) . ' WHERE id=:id';
            $s = $pdo->prepare($sql);
            $data = array_intersect_key($v, array_flip($cols));
            $data['id'] = $id;
            $s->execute($data);
            if (!$s->rowCount()) {
                $check = $pdo->prepare('SELECT id FROM attractions WHERE id=?');
                $check->execute([$id]);
                if (!$check->fetch())
                    out(['error' => 'Attraction not found.'], 404);
            }
        }
        $pdo->prepare('DELETE FROM attraction_categories WHERE attraction_id=?')->execute([$id]);
        $rel = $pdo->prepare('INSERT INTO attraction_categories (attraction_id,category_id) VALUES (?,?)');
        foreach ($v['category_ids'] as $catId)
            $rel->execute([$id, $catId]);
        $pdo->prepare('DELETE FROM attraction_facilities WHERE attraction_id=?')->execute([$id]);
        $facilityInsert = $pdo->prepare('INSERT IGNORE INTO facilities (name) VALUES (?)');
        $facilityFind = $pdo->prepare('SELECT id FROM facilities WHERE name=?');
        $facilityLink = $pdo->prepare('INSERT INTO attraction_facilities (attraction_id,facility_id) VALUES (?,?)');
        foreach ($v['facility_items'] as $facilityName) {
            $facilityInsert->execute([$facilityName]);
            $facilityFind->execute([$facilityName]);
            $facilityId = (int) $facilityFind->fetchColumn();
            if ($facilityId > 0)
                $facilityLink->execute([$id, $facilityId]);
        }
        $pdo->commit();
        return $id;
    } catch (Throwable $e) {
        if ($pdo->inTransaction())
            $pdo->rollBack();
        throw $e;
    }
}

$route = trim((string) ($_GET['route'] ?? ''), '/');
$method = $_SERVER['REQUEST_METHOD'];
try {
    if ($route === 'csrf' && $method === 'GET') {
        if (empty($_SESSION['csrf']))
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        out(['token' => $_SESSION['csrf']]);
    }
    if ($route === 'auth/login') {
        needMethod('POST');
        csrf();
        $d = body();
        $rawUser = $d['username'] ?? '';
        $rawPass = $d['password'] ?? '';
        $username = is_string($rawUser) ? substr(trim($rawUser), 0, 80) : '';
        $password = is_string($rawPass) ? $rawPass : '';
        $appKey = applicationKey();
        $ipHash = hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), $appKey);
        $q = db()->prepare('SELECT attempts,window_started,locked_until FROM admin_login_attempts WHERE ip_hash=?');
        $q->execute([$ipHash]);
        $attempt = $q->fetch();
        if ($attempt && $attempt['locked_until'] && strtotime($attempt['locked_until']) > time())
            out(['error' => 'Login temporarily unavailable. Try again later.'], 429);
        $q = db()->prepare('SELECT id,username,password_hash FROM admin_users WHERE username=? AND is_active=1');
        $q->execute([$username]);
        $u = $q->fetch();
        if (!$u || !password_verify($password, $u['password_hash'])) {
            $now = date('Y-m-d H:i:s');
            if (!$attempt || strtotime($attempt['window_started']) < time() - 900) {
                $s = db()->prepare('INSERT INTO admin_login_attempts (ip_hash,attempts,window_started,locked_until) VALUES (?,1,?,NULL) ON DUPLICATE KEY UPDATE attempts=1,window_started=VALUES(window_started),locked_until=NULL');
                $s->execute([$ipHash, $now]);
            } else {
                $n = (int) $attempt['attempts'] + 1;
                $lock = $n >= 5 ? date('Y-m-d H:i:s', time() + 900) : null;
                $s = db()->prepare('UPDATE admin_login_attempts SET attempts=?,locked_until=? WHERE ip_hash=?');
                $s->execute([min($n, 255), $lock, $ipHash]);
            }
            out(['error' => 'Invalid username or password.'], 401);
        }
        db()->prepare('DELETE FROM admin_login_attempts WHERE ip_hash=?')->execute([$ipHash]);
        db()->exec('DELETE FROM admin_login_attempts WHERE window_started < NOW() - INTERVAL 1 DAY');
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int) $u['id'];
        $_SESSION['admin_username'] = $u['username'];
        $_SESSION['last_activity'] = time();
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        db()->prepare('UPDATE admin_users SET last_login_at=NOW() WHERE id=?')->execute([$u['id']]);
        out(['admin' => ['username' => $u['username']], 'csrf' => $_SESSION['csrf']]);
    }
    if ($route === 'auth/logout') {
        needMethod('POST');
        csrf();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'domain' => $p['domain'], 'secure' => $p['secure'], 'httponly' => $p['httponly'], 'samesite' => 'Lax']);
        }
        session_destroy();
        out(['ok' => true]);
    }
    if ($route === 'categories' && $method === 'GET')
        out(['items' => categoryRows(db())]);
    if ($route === 'attractions' && $method === 'GET')
        out(['items' => places(db())]);
    $pdo = db();
    $user = activeAdmin($pdo);
    if ($route === 'admin/dashboard' && $method === 'GET') {
        $count = (int) $pdo->query('SELECT COUNT(*) FROM attractions')->fetchColumn();
        $categories = categoryRows($pdo);
        $recentAdded = $pdo->query('SELECT id,name,created_at,updated_at FROM attractions ORDER BY created_at DESC,id DESC LIMIT 5')->fetchAll();
        $recentUpdated = $pdo->query('SELECT id,name,updated_at FROM attractions WHERE updated_at>created_at ORDER BY updated_at DESC,id DESC LIMIT 5')->fetchAll();
        $coverage = $pdo->query("SELECT COUNT(*) total,SUM(opening_hours IS NOT NULL AND opening_hours<>'') opening_hours,SUM(entrance_fee IS NOT NULL) entrance_fee,SUM(facilities IS NOT NULL AND facilities<>'') facilities,SUM(visit_minutes IS NOT NULL) visit_minutes,SUM(latitude IS NOT NULL AND longitude IS NOT NULL) coordinates,SUM(opening_hours IS NOT NULL AND entrance_fee IS NOT NULL AND facilities IS NOT NULL AND visit_minutes IS NOT NULL) complete_records FROM attractions")->fetch();
        foreach (['total', 'opening_hours', 'entrance_fee', 'facilities', 'visit_minutes', 'coordinates', 'complete_records'] as $key)
            $coverage[$key] = (int) ($coverage[$key] ?? 0);
        foreach ($recentAdded as &$item)
            $item['id'] = (int) $item['id'];
        unset($item);
        foreach ($recentUpdated as &$item)
            $item['id'] = (int) $item['id'];
        unset($item);
        out(['attraction_count' => $count, 'category_count' => count($categories), 'category_counts' => $categories, 'recently_added' => $recentAdded, 'recently_updated' => $recentUpdated, 'data_completeness' => $coverage, 'admin' => ['username' => $user['username']]]);
    }
    if ($route === 'admin/attractions' && $method === 'GET')
        out(['items' => places($pdo, true)]);
    if (preg_match('#^admin/attractions/(\d+)$#', $route, $m)) {
        $id = (int) $m[1];
        if ($method === 'GET')
            out(['item' => onePlace($pdo, $id, true)]);
        csrf();
        if ($method === 'DELETE') {
            $s = $pdo->prepare('DELETE FROM attractions WHERE id=?');
            $s->execute([$id]);
            if (!$s->rowCount())
                out(['error' => 'Attraction not found.'], 404);
            out(['ok' => true]);
        }
        if ($method === 'PUT') {
            $v = validatePlace(body(), $pdo);
            writePlace($pdo, $v, $id);
            out(['item' => onePlace($pdo, $id, true)]);
        }
        needMethod('PUT or DELETE');
    }
    if ($route === 'admin/attractions' && $method === 'POST') {
        csrf();
        $id = writePlace($pdo, validatePlace(body(), $pdo));
        out(['item' => onePlace($pdo, $id, true)], 201);
    }
    if ($route === 'admin/categories' && $method === 'GET')
        out(['items' => categoryRows($pdo)]);
    if ($route === 'admin/categories' && $method === 'POST') {
        csrf();
        $name = categoryName(body());
        $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $name), '-'));
        if ($slug === '')
            out(['error' => 'Category name must contain English letters or numbers.'], 422);
        $s = $pdo->prepare('INSERT INTO categories (name,slug,is_system) VALUES (?,?,0)');
        try {
            $s->execute([$name, $slug]);
        } catch (PDOException $e) {
            out(['error' => 'A category with that name or identifier already exists.'], 409);
        }
        out(['item' => ['id' => (int) $pdo->lastInsertId(), 'name' => $name, 'slug' => $slug, 'is_system' => 0]], 201);
    }
    if (preg_match('#^admin/categories/(\d+)$#', $route, $m)) {
        $id = (int) $m[1];
        if (!in_array($method, ['PUT', 'DELETE'], true)) {
            header('Allow: PUT, DELETE');
            out(['error' => 'Method not allowed.'], 405);
        }
        csrf();
        $s = $pdo->prepare('SELECT id,is_system FROM categories WHERE id=?');
        $s->execute([$id]);
        $cat = $s->fetch();
        if (!$cat)
            out(['error' => 'Category not found.'], 404);
        if ((int) $cat['is_system'] === 1)
            out(['error' => 'The four project categories are protected.'], 409);
        if ($method === 'PUT') {
            $name = categoryName(body());
            $slug = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $name), '-'));
            if ($slug === '')
                out(['error' => 'Category name must contain English letters or numbers.'], 422);
            try {
                $s = $pdo->prepare('UPDATE categories SET name=?,slug=? WHERE id=?');
                $s->execute([$name, $slug, $id]);
            } catch (PDOException $e) {
                out(['error' => 'A category with that name or identifier already exists.'], 409);
            }
            out(['ok' => true]);
        }
        if ($method === 'DELETE') {
            $s = $pdo->prepare('SELECT COUNT(*) FROM attraction_categories WHERE category_id=?');
            $s->execute([$id]);
            if ((int) $s->fetchColumn() > 0)
                out(['error' => 'Reassign the attractions using this category before deleting it.'], 409);
            $pdo->prepare('DELETE FROM categories WHERE id=?')->execute([$id]);
            out(['ok' => true]);
        }
        needMethod('PUT or DELETE');
    }
    out(['error' => 'Route not found.'], 404);
} catch (Throwable $e) {
    error_log('Fieldnotes API error: ' . $e->getMessage());
    out(['error' => localServiceError($e)], 503);
}