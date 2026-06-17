import json, urllib.request, time

time.sleep(25)
with urllib.request.urlopen("http://localhost:8080/api/heartbeat") as r:
    d = json.loads(r.read())

print("Contributing:", d["contributing"])
print("Freshest:", d["freshestEvidence"])
for s in d["sources"]:
    print(s["id"], s.get("lastFetchIso") or "pending", "cnt:", s["lastCount"], "err:", s["error"])
print("State summary:", d["stateSummary"])
