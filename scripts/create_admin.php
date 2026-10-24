<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../config/database.php';
$username = $argv[1] ?? '';
$password = getenv('FIELDNOTES_INITIAL_ADMIN_PASSWORD');
if (!preg_match('/^[A-Za-z0-9._-]{3,80}$/', $username)) {
    fwrite(STDERR, "Usage: php scripts/create_admin.php <username>\nUsername must be 3–80 letters, numbers, dots, underscores or hyphens.\n"); exit(2);
}
if ($password === false || strlen($password) < 12 || strlen($password) > 72) {
    fwrite(STDERR, "Set FIELDNOTES_INITIAL_ADMIN_PASSWORD securely to a 12–72 byte password before running this command.\n"); exit(2);
}
try {
    $pdo = db();
    $count = (int)$pdo->query('SELECT COUNT(*) FROM admin_users')->fetchColumn();
    if ($count !== 0) { fwrite(STDERR, "An administrator already exists. Use a reviewed account recovery process.\n"); exit(3); }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare('INSERT INTO admin_users (username,password_hash) VALUES (:u,:p)');
    $stmt->execute(['u'=>$username,'p'=>$hash]);
    fwrite(STDOUT, "Administrator created. Keep the password private.\n");
} catch (Throwable $e) {
    fwrite(STDERR, "Administrator setup failed. Verify database configuration and schema.\n"); exit(1);
} finally {
    if (is_string($password) && function_exists('sodium_memzero')) sodium_memzero($password);
    putenv('FIELDNOTES_INITIAL_ADMIN_PASSWORD');
}
