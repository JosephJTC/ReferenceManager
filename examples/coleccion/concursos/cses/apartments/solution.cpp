#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int n, m, k;
    cin >> n >> m >> k;
    vector<int> a(n), b(m);
    for (int &x : a) cin >> x;
    for (int &x : b) cin >> x;
    sort(a.begin(), a.end());
    sort(b.begin(), b.end());
    int i = 0, j = 0, answer = 0;
    while (i < n && j < m) {
        if (abs(a[i] - b[j]) <= k) { ++answer; ++i; ++j; }
        else if (b[j] < a[i] - k) ++j;
        else ++i;
    }
    cout << answer << '\n';
}
