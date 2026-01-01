document.addEventListener('DOMContentLoaded', async () => {
    const loading = document.getElementById('loading');
    const form = document.getElementById('form');
    const status = document.getElementById('status');
    const submitBtn = document.getElementById('submit-btn');

    // 1. Get current tab URL
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    document.getElementById('article_link').value = tab.url;

    try {
        // 2. DOI Detection
        const injection = await chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: () => {
                const doiMeta = document.querySelector('meta[name="citation_doi"]') 
                             || document.querySelector('meta[name="dc.identifier"]');
                return doiMeta ? doiMeta.content : null;
            }
        });

        const doi = injection[0].result;

        if (doi) {
            status.innerText = `✅ Detected DOI: ${doi}`;
            const res = await fetch(`https://api.crossref.org/works/${doi}`);
            if (res.ok) {
                const data = await res.json();
                const item = data.message;

                document.getElementById('title').value = item.title?.[0] || "";
                document.getElementById('abstract').value = item.abstract || "";
                
                if (item.author) {
                    const authorNames = item.author.map(a => `${a.given} ${a.family}`).join(", ");
                    document.getElementById('authors').value = authorNames;
                }
            }
        } else {
            status.innerText = "⚠️ No DOI found. Please fill manually.";
        }
    } catch (err) {
        console.error(err);
        status.innerText = "⚠️ Auto-detection failed.";
    } finally {
        loading.classList.add('hidden');
        form.classList.remove('hidden');
    }

    // 4. Handle Submit
    submitBtn.addEventListener('click', async () => {
        const token = document.getElementById('token').value;
        if (!token) {
            status.className = "error";
            status.innerText = "Please enter an Auth Token.";
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting...";

        const authorString = document.getElementById('authors').value;
        const authorList = authorString.split(',').map(name => ({
            label: name.trim(),
            value: name.trim()
        })).filter(a => a.value);

       
        let subType = document.getElementById('submission_type').value;

        const articleData = {
            payload: {
                title: document.getElementById('title').value,
                abstract: document.getElementById('abstract').value,
                authors: authorList,
                article_link: document.getElementById('article_link').value,
                submission_type: subType, 
            }
        };

        const formData = new FormData();
        formData.append('details', JSON.stringify(articleData));

        try {
            const response = await fetch('http://127.0.0.1:8000/api/articles/articles/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                status.className = "success";
                status.innerText = "✅ Saved! Opening Library...";
                
                const targetUrl = `http://localhost:3000/articles/${result.slug}`;
                chrome.tabs.create({ url: targetUrl });
                window.close();
                
            } else {
               
                const errText = await response.text();
                console.error("Server Error:", errText);
                status.className = "error";
                status.innerText = "❌ Error: " + response.status;
                submitBtn.disabled = false;
                submitBtn.innerText = "Submit to Library";
            }
        } catch (error) {
            console.error(error);
            status.className = "error";
            status.innerText = "❌ Network Error.";
            submitBtn.disabled = false;
            submitBtn.innerText = "Submit to Library";
        }
    });
});