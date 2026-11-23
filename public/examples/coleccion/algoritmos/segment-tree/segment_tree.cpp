#include <bits/stdc++.h>
using namespace std;

struct SegmentTree {
    int n;
    vector<long long> t;
    explicit SegmentTree(const vector<long long>& a) : n(a.size()), t(4 * a.size()) { build(a, 1, 0, n - 1); }

    void build(const vector<long long>& a, int v, int lo, int hi) {
        if (lo == hi) { t[v] = a[lo]; return; }
        int mid = (lo + hi) / 2;
        build(a, 2 * v, lo, mid);
        build(a, 2 * v + 1, mid + 1, hi);
        t[v] = t[2 * v] + t[2 * v + 1];
    }

    long long query(int l, int r, int v, int lo, int hi) const {
        if (r < lo || hi < l) return 0;              // sin intersección
        if (l <= lo && hi <= r) return t[v];         // contenido por completo
        int mid = (lo + hi) / 2;
        return query(l, r, 2 * v, lo, mid) + query(l, r, 2 * v + 1, mid + 1, hi);
    }
    long long query(int l, int r) const { return query(l, r, 1, 0, n - 1); }

    void update(int pos, long long value, int v, int lo, int hi) {
        if (lo == hi) { t[v] = value; return; }
        int mid = (lo + hi) / 2;
        if (pos <= mid) update(pos, value, 2 * v, lo, mid);
        else update(pos, value, 2 * v + 1, mid + 1, hi);
        t[v] = t[2 * v] + t[2 * v + 1];
    }
    void update(int pos, long long value) { update(pos, value, 1, 0, n - 1); }
};

int main() {
    int n, q;
    cin >> n >> q;
    vector<long long> a(n);
    for (auto& x : a) cin >> x;
    SegmentTree st(a);
    while (q--) {
        int type; cin >> type;
        if (type == 1) { int pos; long long value; cin >> pos >> value; st.update(pos, value); }
        else { int l, r; cin >> l >> r; cout << st.query(l, r) << '\n'; }
    }
}
