// Synthetic transport probe only. No game code, database client, file writes,
// outbound connections, credentials, or environment enumeration.
#include <arpa/inet.h>
#include <errno.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/utsname.h>
#include <time.h>
#include <unistd.h>
#ifndef CANARY_NONCE
#error CANARY_NONCE is required
#endif
#ifndef CANARY_SPEC_SHA256
#error CANARY_SPEC_SHA256 is required
#endif
static volatile sig_atomic_t stopped = 0;
static void stop(int signal_number) { (void)signal_number; stopped = 1; }
static int hex(const char *s, size_t n) {
 if (strlen(s) != n) return 0;
 for (size_t i = 0; i < n; i++) if (!((s[i] >= '0' && s[i] <= '9') || (s[i] >= 'a' && s[i] <= 'f'))) return 0;
 return 1;
}
static double now(void) { struct timespec t; if (clock_gettime(CLOCK_MONOTONIC, &t)) return -1; return t.tv_sec + t.tv_nsec / 1e9; }
static int fail(void) { fputs("CANARY: FAIL\n", stderr); return 1; }
int main(int argc, char **argv) {
 struct utsname u;
 if (!hex(CANARY_NONCE, 32) || !hex(CANARY_SPEC_SHA256, 64) || geteuid() != 65532 ||
     uname(&u) || strcmp(u.sysname, "Linux") || strcmp(u.machine, "x86_64")) return fail();
 if (argc > 2 || (argc == 2 && strcmp(argv[1], "--self-test"))) return fail();
 char report[512];
 int count = snprintf(report, sizeof report,
  "{\"kind\":\"kingdom-image-canary-v1\",\"os\":\"linux\",\"architecture\":\"amd64\",\"uid\":65532,\"nonce\":\"%s\",\"sourceSpecSha256\":\"%s\",\"maximumLifetimeSeconds\":120}",
  CANARY_NONCE, CANARY_SPEC_SHA256);
 if (count < 0 || count >= (int)sizeof report) return fail();
 if (argc == 2) { puts(report); return 0; }
 const char *port_value = getenv("PORT");
 if (!port_value) port_value = "8080";
 if (!*port_value || strlen(port_value) > 5) return fail();
 for (const char *p = port_value; *p; p++) if (*p < '0' || *p > '9') return fail();
 unsigned long port = strtoul(port_value, NULL, 10);
 if (port < 1024 || port > 65535) return fail();
 int fd = socket(AF_INET, SOCK_STREAM, 0);
 if (fd < 0) return fail();
 struct sockaddr_in address = {.sin_family = AF_INET, .sin_port = htons((unsigned short)port), .sin_addr.s_addr = htonl(INADDR_ANY)};
 if (bind(fd, (struct sockaddr *)&address, sizeof address) || listen(fd, 8)) { close(fd); return fail(); }
 signal(SIGTERM, stop); signal(SIGINT, stop); signal(SIGPIPE, SIG_IGN);
 const double started = now();
 if (started < 0) { close(fd); return fail(); }
 puts(report); fflush(stdout);
 while (!stopped) {
  double current = now();
  if (current < 0 || current - started >= 120) break;
  struct pollfd ready = {.fd = fd, .events = POLLIN};
  int polled = poll(&ready, 1, 250);
  if (polled < 0) { if (errno == EINTR) continue; close(fd); return fail(); }
  if (!polled) continue;
  int client = accept(fd, NULL, NULL);
  if (client < 0) continue;
  struct timeval timeout = {.tv_sec = 1, .tv_usec = 0};
  setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof timeout);
  setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof timeout);
  char request[1024], response[1024]; size_t size = 0;
  while (!stopped && now() - started < 120 && size < sizeof request - 1) {
   ssize_t got = recv(client, request + size, sizeof request - 1 - size, 0);
   if (got <= 0) break;
   size += (size_t)got; request[size] = 0;
   if (strstr(request, "\r\n\r\n")) break;
  }
  request[size] = 0;
  int healthy = !strncmp(request, "GET /healthz HTTP/1.1\r\n", 23) || !strncmp(request, "GET /healthz HTTP/1.0\r\n", 23);
  const char *body = healthy ? report : "{}";
  int length = snprintf(response, sizeof response, "HTTP/1.1 %s\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: %zu\r\n\r\n%s", healthy ? "200 OK" : "404 Not Found", strlen(body), body);
  if (length > 0 && length < (int)sizeof response) {
   size_t sent = 0;
   while (!stopped && now() - started < 120 && sent < (size_t)length) { ssize_t n = send(client, response + sent, (size_t)length - sent, 0); if (n <= 0) break; sent += (size_t)n; }
  }
  close(client);
 }
 close(fd); return 0;
}
