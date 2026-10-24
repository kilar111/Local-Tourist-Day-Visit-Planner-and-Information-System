<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO)
        return $pdo;
    $localXampp = PHP_SAPI !== 'cli' && in_array((string) ($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
    $host = getenv('FIELDNOTES_DB_HOST') ?: ($localXampp ? '127.0.0.1' : '');
    $name = getenv('FIELDNOTES_DB_NAME') ?: ($localXampp ? 'fieldnotes' : '');
    $user = getenv('FIELDNOTES_DB_USER') ?: ($localXampp ? 'root' : '');
    $pass = getenv('FIELDNOTES_DB_PASSWORD');
    if ($pass === false && $localXampp)
        $pass = '';
    $port = getenv('FIELDNOTES_DB_PORT') ?: ($localXampp ? '3307' : '3306');
    if ($host === '' || $name === '' || $user === '' || $pass === false) {
        throw new RuntimeException('Database configuration is incomplete.');
    }
    if (!ctype_digit($port) || (int) $port < 1 || (int) $port > 65535) {
        throw new RuntimeException('Database port is invalid.');
    }
    $dsn = 'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $name . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $user, (string) $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
