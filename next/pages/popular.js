import Head from 'next/head';
import Link from 'next/link';
import API, { graphqlOperation } from '@aws-amplify/api';
import Analytics from '@aws-amplify/analytics';

import PageHeader from '@/common/PageHeader';
import ArticleCard from '@/article/ArticleCard';
import Loader from '@/ui/Loader';

const popularArticles = /* GraphQL */ `
    query PopularArticles(
      $limit: Int,
      $nextToken: String
    ) {
      popularArticles(limit: $limit, nextToken: $nextToken) {
        items {
          id
          title
          image
          excerpt
          publishedAt
          blog {
            id
            title
          }
        }
        nextToken
      }
    }
  `;

/**
 * Use Next.js server-side generation to build pages upfront. Building on the
 * server saves runtime costs and reduces latency as they are generally slow moving.
 * 
 * @param {} context 
 */
export async function getStaticProps(context) {

  // load the blog data from the GraphQL endpoint
  const data = await API.graphql(graphqlOperation(popularArticles, { limit: 25 }))
                        .then(r => {
                          const { data: { popularArticles } } = r;
                          return popularArticles;
                        });

  return {
    props: {
      articles: data.items,
      nextToken: data.nextToken
    },
    revalidate: 900
  }
}

export default function Home({ articles }) {
  if (!articles) return <div><Loader /></div>

  Analytics.record({
    name: 'pageView',
    attributes: {
      path: '/popular',
      title: '[Home] Popular Articles'
    }
  });

  return (
    <>
      <Head>
        <title>AWS News</title>
      </Head>      

      <div className="hidden sm:block">
        <PageHeader title="Popular Articles"/>

        <div className="flex flex-row h-10 border-b border-gray-300 justify-center content-center text-sm">
          <div className="px-4 py m-2 inline">
            <span className="font-semibold mr-1">View:</span>
            <span className="divide-x space-x-1">
                <Link href="/">
                  <a className="pl-1">
                    Latest
                  </a>
                </Link>
                <span className="selected pl-1">
                  Popular
                </span>
            </span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-300 sm:px-8 sm:space-y-4">
        { articles.filter(a => a).sort((a, b) => (a.publishedAt > b.publishedAt) ? -1 : 1).map((article) =>
          <ArticleCard article={ article } key={ article.id } />
        )}
      </div>

      <style jsx>{`
          button:focus {
            @apply outline-none;
          }

          .selected {
            @apply font-extrabold text-indigo-800;
          }
        `}
      </style>
    </>
  )
}
