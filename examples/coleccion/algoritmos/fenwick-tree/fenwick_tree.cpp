// Fenwick Tree (Binary Indexed Tree): sumas de prefijo y actualizaciones puntuales en O(log n).
#include <bits/stdc++.h>
using namespace std;

struct Fenwick {
    int n;
    vector<long long> t;  // t[i] = suma de (i - lowbit(i), i], índices 1..n
    explicit Fenwick(const vector<long long>& a) : n(a.size()), t(a.size() + 1, 0) {
        for (int i = 1; i <= n; i++) {           // construcción en O(n)
            t[i] += a[i - 1];
            int parent = i + (i & -i);
            if (parent <= n) t[parent] += t[i];
        }
    }
    void add(int pos, long long delta) {          // a[pos] += delta (pos en 0..n-1)
        for (int i = pos + 1; i <= n; i += i & -i) t[i] += delta;
    }
    long long prefix(int r) const {               // suma de a[0..r]
        long long s = 0;
        for (int i = r + 1; i > 0; i -= i & -i) s += t[i];
        return s;
    }
    long long range(int l, int r) const { return prefix(r) - (l ? prefix(l - 1) : 0); }
};

int main() {
    Fenwick bit({3, 2, -1, 6, 5, 4, -3, 3});
    cout << bit.range(2, 6) << '\n';  // 11
    bit.add(2, 4);
    cout << bit.range(2, 6) << '\n';  // 15
}
